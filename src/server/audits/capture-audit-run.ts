import type { AuditJobRepository, AuditRunProgress } from "@/db/audits";
import { auditJobRepository } from "@/db/audits";
import {
  AuditFailureError,
  detectAuditCaptureBarrier,
  toAuditFailure,
} from "@/lib/audit-failure";
import { assertPublicUrl, SSRFError } from "@/lib/ssrf";
import type { StorageClient } from "@/server/contracts/storage";
import { storageClient } from "@/server/contracts/storage";
import type { CaptureMethodProvenance, PageSnapshot, PageState, PageType } from "@/lib/types";
import { buildCapturePlan, getPagePriority } from "@/server/audits/page-archetypes";
import { planCaptureMethod } from "@/lib/capture-policy";
import { browserDriver } from "@/server/browser/create-browser-driver";
import type {
  BrowserDiscoveredLink,
  BrowserDriver,
  BrowserSession,
} from "@/server/browser/types";

const DEFAULT_MAX_PAGES = 5;
const CAPTURE_PENDING_STATES = new Set<PageState>(["queued", "capturing"]);
const BROWSER_BLOCKED_LIMITATION_NOTE =
  "Browser capture was blocked by a security challenge. Evidence collected via public HTTP fetch without rendered page state or screenshots.";
const BROWSER_UNAVAILABLE_LIMITATION_NOTE =
  "Browser rendering is unavailable in this environment. Evidence collected via public HTTP fetch without rendered page state or screenshots.";

export interface AuditCaptureRequest {
  auditRunId: string;
  domain: string;
  maxPages?: number;
}

export interface AuditCaptureResult {
  auditRunId: string;
  pagesProcessed: number;
  homepageOnly: boolean;
  limitationNote?: string | null;
  errorMessage?: string;
}

export interface CaptureAuditRunDeps {
  auditJobs: Pick<
    AuditJobRepository,
    | "getAuditRunProgress"
    | "updateAuditRunStatus"
    | "insertPageSnapshot"
    | "updatePageSnapshotState"
    | "completePageSnapshotCapture"
    | "insertAuditRunAttempt"
  >;
  storage: Pick<StorageClient, "put">;
  browser: BrowserDriver;
  waitAfterNavigation: (timeoutMs: number) => Promise<void>;
  fetchStatic?: typeof fetchStaticPage;
}

const defaultDeps: CaptureAuditRunDeps = {
  auditJobs: auditJobRepository,
  storage: storageClient,
  browser: browserDriver,
  waitAfterNavigation: waitForSettledDom,
};

function buildArtifactKey(
  auditRunId: string,
  pageType: PageType,
  pageUrl: string,
  extension: "html" | "jpg"
) {
  const url = new URL(pageUrl);
  const pathname = url.pathname === "/" ? "root" : url.pathname.replace(/^\/+/, "");
  const sanitizedPath = pathname.replace(/[^a-zA-Z0-9/_-]/g, "_").replace(/\/+/g, "_");

  return `audit-runs/${auditRunId}/${pageType}/${sanitizedPath}.${extension}`;
}

async function waitForSettledDom(timeoutMs: number) {
  await new Promise((resolve) => setTimeout(resolve, timeoutMs));
}

function compareSnapshots(left: PageSnapshot, right: PageSnapshot) {
  const priorityDelta =
    (left.pagePriority ?? getPagePriority(left.pageType)) -
    (right.pagePriority ?? getPagePriority(right.pageType));
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return left.url.localeCompare(right.url);
}

function summarizeCaptureProgress(
  progress: AuditRunProgress,
  limitationNote?: string | null
): AuditCaptureResult {
  const capturedPages = progress.pageSnapshots.filter((snapshot) => snapshot.htmlStorageKey);
  const homepageOnly = !progress.pageSnapshots.some(
    (snapshot) => snapshot.pageType !== "homepage" && snapshot.htmlStorageKey
  );

  return {
    auditRunId: progress.auditRun.id,
    pagesProcessed: capturedPages.length,
    homepageOnly,
    limitationNote: limitationNote ?? null,
  };
}

function shouldDiscoverPages(progress: AuditRunProgress) {
  return progress.pageSnapshots.length === 0 || progress.auditRun.status === "discovering";
}

function getCaptureFailureStage(progress: AuditRunProgress | null) {
  if (!progress || shouldDiscoverPages(progress)) {
    return "discover" as const;
  }

  return "capture" as const;
}

// ─── Static fetch path ────────────────────────────────────────────────────────

interface StaticPageResult {
  html: string;
  statusCode: number;
  ok: boolean;
  finalUrl: string;
}

export async function fetchStaticPage(url: string): Promise<StaticPageResult> {
  // SSRF guard: resolve hostname before any network I/O and reject private targets.
  try {
    await assertPublicUrl(url);
  } catch (error) {
    if (error instanceof SSRFError) {
      throw new AuditFailureError({
        failureKind: "access_denied",
        failureStage: "capture",
        failureReason: error.message,
        failureDetails: { source: "network", marker: "access_denied", retryable: false, url },
      });
    }
    throw error;
  }

  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    // Cap redirects to prevent redirect-chain SSRF; Node fetch default is 20.
    signal: AbortSignal.timeout(15000),
  });

  // Re-validate the final URL after redirect to guard against public→private redirect chains.
  try {
    await assertPublicUrl(response.url);
  } catch (error) {
    if (error instanceof SSRFError) {
      throw new AuditFailureError({
        failureKind: "access_denied",
        failureStage: "capture",
        failureReason: `Redirect target rejected: ${error.message}`,
        failureDetails: { source: "network", marker: "access_denied", retryable: false, url: response.url },
      });
    }
    throw error;
  }

  const html = await response.text();
  return {
    html,
    statusCode: response.status,
    ok: response.ok,
    finalUrl: response.url,
  };
}

/**
 * Extracts same-origin href links from raw HTML without a JS runtime.
 * Used for static discovery when browser is unavailable.
 */
export function extractLinksFromStaticHtml(
  html: string,
  baseUrl: string
): BrowserDiscoveredLink[] {
  const origin = new URL(baseUrl).origin;
  const links: BrowserDiscoveredLink[] = [];
  const hrefRegex = /href=["']([^"'#\s]+)["']/gi;

  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    try {
      const url = new URL(match[1], baseUrl);
      if (url.origin === origin) {
        links.push({
          href: url.href,
          origin: url.origin,
          pathname: url.pathname,
          text: "",
        });
      }
    } catch {
      // ignore invalid or relative-only hrefs
    }
  }

  return links;
}

async function captureStaticPage(
  auditRunId: string,
  snapshot: Pick<PageSnapshot, "id" | "url" | "pageType" | "retryCount" | "auditRunId">,
  deps: CaptureAuditRunDeps,
  captureMethod: CaptureMethodProvenance = "static"
): Promise<boolean> {
  const fetcher = deps.fetchStatic ?? fetchStaticPage;

  await deps.auditJobs.updatePageSnapshotState({
    pageSnapshotId: snapshot.id,
    pageState: "capturing",
    retryCount: snapshot.retryCount ?? 0,
    lastError: null,
  });

  try {
    const result = await fetcher(snapshot.url);

    if (!result.ok) {
      throw new Error(`Static fetch failed. Status: ${result.statusCode}`);
    }

    const barrier = detectAuditCaptureBarrier({
      stage: "capture",
      statusCode: result.statusCode,
      html: result.html,
      url: result.finalUrl,
      driver: "static",
    });

    if (barrier) {
      throw new AuditFailureError(barrier);
    }

    const htmlStorageKey = await deps.storage.put(
      buildArtifactKey(auditRunId, snapshot.pageType, result.finalUrl, "html"),
      result.html,
      "text/html"
    );

    await deps.auditJobs.completePageSnapshotCapture({
      pageSnapshotId: snapshot.id,
      url: result.finalUrl,
      htmlStorageKey,
      screenshotStorageKey: null,
      captureMethod,
      retryCount: snapshot.retryCount ?? 0,
    });

    return true;
  } catch (error) {
    const failure = toAuditFailure(error, {
      stage: "capture",
      url: snapshot.url,
      driver: "static",
    });

    await deps.auditJobs.updatePageSnapshotState({
      pageSnapshotId: snapshot.id,
      pageState: snapshot.pageType === "homepage" ? "failed" : "needs_review",
      retryCount: snapshot.retryCount ?? 0,
      lastError: failure.failureReason,
    });

    if (snapshot.pageType === "homepage") {
      throw new AuditFailureError(failure);
    }

    await deps.auditJobs.insertAuditRunAttempt({
      auditRunId,
      pageSnapshotId: snapshot.id,
      stage: "capture",
      attempt: snapshot.retryCount ?? 1,
      failureKind: failure.failureKind,
      evaluatorFeedback: failure.failureReason,
      nextRetryStrategy: "needs_review",
    }).catch(() => undefined);

    console.error(`[audit-capture] Static capture failed for ${snapshot.url}`, error);
    return false;
  }
}

// ─── Browser capture path ─────────────────────────────────────────────────────

interface CaptureQueuedPageResult {
  captured: boolean;
  captureBlocked: boolean;
}

async function captureQueuedPage(
  session: BrowserSession,
  auditRunId: string,
  snapshot: Pick<PageSnapshot, "id" | "url" | "pageType" | "retryCount" | "auditRunId">,
  deps: CaptureAuditRunDeps
): Promise<CaptureQueuedPageResult> {
  const startingRetryCount = Math.min(snapshot.retryCount ?? 0, 1);

  for (let attempt = startingRetryCount; attempt <= 1; attempt += 1) {
    await deps.auditJobs.updatePageSnapshotState({
      pageSnapshotId: snapshot.id,
      pageState: "capturing",
      retryCount: attempt,
      lastError: null,
    });

    try {
      const response = await session.navigate({
        url: snapshot.url,
        waitUntil: "load",
        timeoutMs: snapshot.pageType === "homepage" ? 30000 : 20000,
      });
      const statusBarrier = detectAuditCaptureBarrier({
        stage: "capture",
        statusCode: response.status,
        url: response.url,
        driver: deps.browser.name,
      });
      if (statusBarrier) {
        throw new AuditFailureError(statusBarrier);
      }

      if (!response.ok) {
        throw new Error(`Failed to load ${snapshot.url}. Status: ${response.status}`);
      }

      await deps.waitAfterNavigation(2000);

      const currentUrl = await session.getUrl();
      const { value: html } = await session.extractHtml();
      const htmlBarrier = detectAuditCaptureBarrier({
        stage: "capture",
        statusCode: response.status,
        html,
        url: currentUrl,
        driver: deps.browser.name,
      });
      if (htmlBarrier) {
        throw new AuditFailureError(htmlBarrier);
      }

      const screenshot = await session.screenshot({
        fullPage: true,
        format: "jpeg",
        quality: 80,
        timeoutMs: 90000,
      });

      const htmlStorageKey = await deps.storage.put(
        buildArtifactKey(auditRunId, snapshot.pageType, currentUrl, "html"),
        html,
        "text/html"
      );
      const screenshotStorageKey = await deps.storage.put(
        buildArtifactKey(auditRunId, snapshot.pageType, currentUrl, "jpg"),
        screenshot.data,
        screenshot.contentType
      );

      await deps.auditJobs.completePageSnapshotCapture({
        pageSnapshotId: snapshot.id,
        url: currentUrl,
        htmlStorageKey,
        screenshotStorageKey,
        captureMethod: "browser",
        retryCount: attempt,
      });

      return { captured: true, captureBlocked: false };
    } catch (error) {
      const failure = toAuditFailure(error, {
        stage: "capture",
        url: snapshot.url,
        driver: deps.browser.name,
      });
      const failureReason = failure.failureReason;
      const captureBlocked = failure.failureKind === "capture_blocked";

      if (attempt === 0) {
        await deps.auditJobs.updatePageSnapshotState({
          pageSnapshotId: snapshot.id,
          pageState: "queued",
          retryCount: 1,
          lastError: failureReason,
        });
        continue;
      }

      // capture_blocked on homepage: return so the capture loop can degrade browser and
      // attempt a static fallback. Any other homepage failure is a hard stop.
      if (snapshot.pageType === "homepage" && !captureBlocked) {
        await deps.auditJobs.updatePageSnapshotState({
          pageSnapshotId: snapshot.id,
          pageState: "failed",
          retryCount: 1,
          lastError: failureReason,
        });
        await deps.auditJobs.insertAuditRunAttempt({
          auditRunId: snapshot.auditRunId,
          pageSnapshotId: snapshot.id,
          stage: "capture",
          attempt: 2,
          failureKind: failure.failureKind,
          evaluatorFeedback: failureReason,
          nextRetryStrategy: "escalate_to_failed",
        }).catch(() => undefined);
        throw new AuditFailureError(failure);
      }

      await deps.auditJobs.updatePageSnapshotState({
        pageSnapshotId: snapshot.id,
        pageState: "needs_review",
        retryCount: 1,
        lastError: failureReason,
      });
      await deps.auditJobs.insertAuditRunAttempt({
        auditRunId: snapshot.auditRunId,
        pageSnapshotId: snapshot.id,
        stage: "capture",
        attempt: 2,
        failureKind: failure.failureKind,
        evaluatorFeedback: failureReason,
        nextRetryStrategy: captureBlocked ? "static_fallback" : "needs_review",
      }).catch(() => undefined);

      console.error(`[audit-capture] Failed to capture ${snapshot.url}`, error);
      return { captured: false, captureBlocked };
    }
  }

  return { captured: false, captureBlocked: false };
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function captureAuditRun(
  request: AuditCaptureRequest,
  deps: CaptureAuditRunDeps = defaultDeps
): Promise<AuditCaptureResult> {
  const { auditRunId, domain, maxPages = DEFAULT_MAX_PAGES } = request;
  const baseUrl = domain.startsWith("http") ? domain : `https://${domain}`;

  // SSRF guard: validate the domain before opening any browser session or HTTP connection.
  try {
    await assertPublicUrl(baseUrl);
  } catch (error) {
    if (error instanceof SSRFError) {
      throw new AuditFailureError({
        failureKind: "access_denied",
        failureStage: "discover",
        failureReason: error.message,
        failureDetails: { source: "network", marker: "access_denied", retryable: false, url: baseUrl },
      });
    }
    throw error;
  }

  // Browser session is created lazily — only when a browser-path page is actually needed.
  let session: BrowserSession | undefined;
  let progress: AuditRunProgress | null = null;
  let browserDegraded = false;
  let limitationNote: string | null = null;

  const getSession = async (): Promise<BrowserSession | null> => {
    if (session) return session;
    if (browserDegraded) return null;
    try {
      session = await deps.browser.createSession();
      return session;
    } catch (launchError) {
      browserDegraded = true;
      limitationNote = BROWSER_UNAVAILABLE_LIMITATION_NOTE;
      console.warn("[audit-capture] Browser unavailable, degrading to static capture", launchError);
      return null;
    }
  };

  try {
    progress = await deps.auditJobs.getAuditRunProgress(auditRunId);

    if (shouldDiscoverPages(progress)) {
      await deps.auditJobs.updateAuditRunStatus({
        auditRunId,
        status: "discovering",
      });

      // Static-first discovery: fetch homepage via HTTP and extract links without a browser.
      // Browser is used later (capture phase) only for homepage screenshot.
      try {
        await doStaticDiscovery(baseUrl, auditRunId, maxPages, deps);
      } catch (discoveryError) {
        // Static fetch itself returned a bot-challenge page. Queue homepage-only so
        // the capture phase can still attempt browser (which may bypass the challenge)
        // and then degrade to static if browser also fails.
        if (
          discoveryError instanceof AuditFailureError &&
          discoveryError.failure.failureKind === "capture_blocked"
        ) {
          limitationNote = BROWSER_BLOCKED_LIMITATION_NOTE;
          await deps.auditJobs.insertPageSnapshot({
            auditRunId,
            url: `${new URL(baseUrl).origin}/`,
            pageType: "homepage",
            pagePriority: getPagePriority("homepage"),
            pageState: "queued",
            retryCount: 0,
            lastError: null,
          });
        } else {
          throw discoveryError;
        }
      }

      progress = await deps.auditJobs.getAuditRunProgress(auditRunId);
    }

    const captureTargets = progress.pageSnapshots
      .filter(
        (snapshot) => snapshot.pageState && CAPTURE_PENDING_STATES.has(snapshot.pageState)
      )
      .sort(compareSnapshots);

    if (captureTargets.length === 0) {
      return summarizeCaptureProgress(progress, limitationNote);
    }

    await deps.auditJobs.updateAuditRunStatus({
      auditRunId,
      status: "capturing",
      homepageOnly: summarizeCaptureProgress(progress, limitationNote).homepageOnly,
    });

    for (const snapshot of captureTargets) {
      const plan = planCaptureMethod({ pageType: snapshot.pageType, browserDegraded });

      if (plan.captureMethod === "browser") {
        const browserSession = await getSession();

        if (!browserSession) {
          // Session unavailable after planning — degrade this page to static.
          await captureStaticPage(auditRunId, snapshot, deps, "fallback_static");
        } else {
          const result = await captureQueuedPage(browserSession, auditRunId, snapshot, deps);
          if (result.captureBlocked && !browserDegraded) {
            browserDegraded = true;
            limitationNote = limitationNote ?? BROWSER_BLOCKED_LIMITATION_NOTE;
            // Page is in needs_review — retry via static fallback.
            await captureStaticPage(auditRunId, snapshot, deps, "fallback_static");
          }
        }
      } else {
        // "static" (primary path for secondary pages) or "fallback_static" (degraded)
        await captureStaticPage(auditRunId, snapshot, deps, plan.captureMethod as CaptureMethodProvenance);
      }
    }

    progress = await deps.auditJobs.getAuditRunProgress(auditRunId);
    return summarizeCaptureProgress(progress, limitationNote);
  } catch (error) {
    const refreshedProgress = await deps.auditJobs
      .getAuditRunProgress(auditRunId)
      .catch(() => progress);
    const failure = toAuditFailure(error, {
      stage: getCaptureFailureStage(refreshedProgress),
      url: baseUrl,
      driver: deps.browser.name,
    });
    const summary = refreshedProgress
      ? summarizeCaptureProgress(refreshedProgress, limitationNote)
      : {
          auditRunId,
          pagesProcessed: 0,
          homepageOnly: true,
          limitationNote,
        };

    await deps.auditJobs.updateAuditRunStatus({
      auditRunId,
      status: "failed",
      failureReason: failure.failureReason,
      failureKind: failure.failureKind,
      failureStage: failure.failureStage,
      failureDetails: failure.failureDetails,
      homepageOnly: summary.homepageOnly,
      limitationNote: limitationNote ?? undefined,
    });

    return {
      ...summary,
      errorMessage: failure.failureReason,
    };
  } finally {
    await session?.close().catch(() => undefined);
  }
}

// ─── Static discovery helper ──────────────────────────────────────────────────

async function doStaticDiscovery(
  baseUrl: string,
  auditRunId: string,
  maxPages: number,
  deps: CaptureAuditRunDeps
): Promise<void> {
  const fetcher = deps.fetchStatic ?? fetchStaticPage;
  const result = await fetcher(baseUrl);

  // HTTP status is the authoritative signal for access barriers (401/403/429).
  const statusBarrier = detectAuditCaptureBarrier({
    stage: "discover",
    statusCode: result.statusCode,
    url: result.finalUrl,
    driver: "static",
  });
  if (statusBarrier) {
    throw new AuditFailureError(statusBarrier);
  }

  if (!result.ok) {
    throw new Error(`Static discovery failed. Status: ${result.statusCode}`);
  }

  // HTML content check: catches bot-challenge pages served with 200 OK.
  const htmlBarrier = detectAuditCaptureBarrier({
    stage: "discover",
    statusCode: result.statusCode,
    html: result.html,
    url: result.finalUrl,
    driver: "static",
  });
  if (htmlBarrier) {
    throw new AuditFailureError(htmlBarrier);
  }

  const links = extractLinksFromStaticHtml(result.html, baseUrl);
  const captureTargets = buildCapturePlan(result.finalUrl, links, maxPages);

  await Promise.all(
    captureTargets.map((target) =>
      deps.auditJobs.insertPageSnapshot({
        auditRunId,
        url: target.url,
        pageType: target.pageType,
        pagePriority: target.pagePriority,
        pageState: "queued",
        retryCount: 0,
        lastError: null,
      })
    )
  );
}
