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
import {
  assessPublicHtmlEvidence,
  HOMEPAGE_BLOCKED_SECONDARY_SWEEP_NOTE,
  isJsShellHtml,
  planCaptureMethod,
  SAFE_SECONDARY_ROUTES,
  SECONDARY_SWEEP_MIN_PAGES,
} from "@/lib/capture-policy";
import { browserDriver } from "@/server/browser/create-browser-driver";
import type {
  BrowserDiscoveredLink,
  BrowserDriver,
  BrowserSession,
} from "@/server/browser/types";

const DEFAULT_MAX_PAGES = 5;
const CAPTURE_PENDING_STATES = new Set<PageState>(["queued", "capturing"]);
const BROWSER_BLOCKED_LIMITATION_NOTE =
  "Browser capture was blocked or degraded by a security challenge. This audit continued using public HTML/static evidence only, so it may not include rendered, protected, or post-hydration page states.";
const BROWSER_UNAVAILABLE_LIMITATION_NOTE =
  "Browser rendering is unavailable in this environment. This audit continued using public HTML/static evidence only, so it may not include rendered, protected, or post-hydration page states.";
const BROWSER_RUNTIME_FAILURE_LIMITATION_NOTE =
  "Browser capture encountered a runtime error. This audit continued using public HTML evidence only. Findings reflect static/public evidence and may not include post-render or protected states.";
const NO_USABLE_PUBLIC_HTML_REASON =
  "No trustworthy public HTML evidence was available after browser capture degraded. The static response looked like a thin shell or access page, so no bounded report was assembled.";

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

async function completeWithStaticResult(
  auditRunId: string,
  snapshot: Pick<PageSnapshot, "id" | "url" | "pageType" | "retryCount" | "auditRunId">,
  deps: CaptureAuditRunDeps,
  result: StaticPageResult,
  captureMethod: CaptureMethodProvenance
) {
  const htmlKey = await deps.storage.put(
    buildArtifactKey(auditRunId, snapshot.pageType, result.finalUrl, "html"),
    result.html,
    "text/html"
  );

  await deps.auditJobs.completePageSnapshotCapture({
    pageSnapshotId: snapshot.id,
    url: result.finalUrl,
    htmlStorageKey: htmlKey,
    screenshotStorageKey: null,
    captureMethod,
    retryCount: snapshot.retryCount ?? 0,
  });
}

async function failNoUsablePublicEvidence(
  auditRunId: string,
  snapshot: Pick<PageSnapshot, "id" | "url" | "pageType" | "retryCount" | "auditRunId">,
  deps: CaptureAuditRunDeps,
  reason = NO_USABLE_PUBLIC_HTML_REASON
): Promise<never> {
  await deps.auditJobs.updatePageSnapshotState({
    pageSnapshotId: snapshot.id,
    pageState: "failed",
    retryCount: snapshot.retryCount ?? 0,
    lastError: reason,
  });
  await deps.auditJobs.insertAuditRunAttempt({
    auditRunId,
    pageSnapshotId: snapshot.id,
    stage: "capture",
    attempt: (snapshot.retryCount ?? 0) + 1,
    failureKind: "blocked",
    evaluatorFeedback: reason,
    nextRetryStrategy: "escalate_to_failed",
  }).catch(() => undefined);

  throw new AuditFailureError({
    failureKind: "blocked",
    failureStage: "capture",
    failureReason: reason,
    failureDetails: {
      source: "target",
      marker: "unknown",
      retryable: false,
      url: snapshot.url,
    },
  });
}

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

      if (attempt === 0 && !captureBlocked) {
        await deps.auditJobs.updatePageSnapshotState({
          pageSnapshotId: snapshot.id,
          pageState: "queued",
          retryCount: 1,
          lastError: failureReason,
        });
        continue;
      }

      // capture_blocked is non-retryable for this run. Degrade to static fallback
      // where public HTML exists; do not keep hammering challenge pages.
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
        attempt: attempt + 1,
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

// ─── Static-preferred capture (homepage static-first policy) ─────────────────

type SessionGetter = () => Promise<BrowserSession | null>;

interface StaticPreferredResult {
  limitationNote: string | null;
  browserDegraded: boolean;
}

/**
 * Captures a homepage using static-first policy:
 * 1. Fetch via public HTTP. Hard-fail only on non-bot-challenge errors (401, 403, DNS, etc.).
 * 2. If HTML is rich enough: store static artifact — no browser needed.
 * 3. If HTML is thin (JS shell):
 *    a. Try browser as upgrade.
 *    b. If browser fails for any reason: use static HTML (if available) with a limitation note.
 *    c. If both browser and static paths lack trustworthy public evidence, hard-fail.
 */
async function captureStaticPreferredPage(
  auditRunId: string,
  snapshot: Pick<PageSnapshot, "id" | "url" | "pageType" | "retryCount" | "auditRunId">,
  deps: CaptureAuditRunDeps,
  getSession: SessionGetter
): Promise<StaticPreferredResult> {
  const fetcher = deps.fetchStatic ?? fetchStaticPage;

  await deps.auditJobs.updatePageSnapshotState({
    pageSnapshotId: snapshot.id,
    pageState: "capturing",
    retryCount: 0,
    lastError: null,
  });

  // Phase 1: Static fetch
  let staticResult: StaticPageResult | null = null;
  let staticWasBotBlocked = false;

  try {
    const raw = await fetcher(snapshot.url);
    if (!raw.ok) {
      throw new Error(`Static fetch failed. Status: ${raw.statusCode}`);
    }
    const barrier = detectAuditCaptureBarrier({
      stage: "capture",
      statusCode: raw.statusCode,
      html: raw.html,
      url: raw.finalUrl,
      driver: "static",
    });
    if (barrier) {
      throw new AuditFailureError(barrier);
    }
    staticResult = raw;
  } catch (staticError) {
    const failure = toAuditFailure(staticError, {
      stage: "capture",
      url: snapshot.url,
      driver: "static",
    });
    if (failure.failureKind === "capture_blocked") {
      // Public HTTP returned a challenge page, so there is no trustworthy static
      // evidence to inspect. Do not try to work around the target's challenge.
      staticWasBotBlocked = true;
    } else {
      // Hard barrier (401, 403, DNS, etc.): no public evidence available.
      await deps.auditJobs.updatePageSnapshotState({
        pageSnapshotId: snapshot.id,
        pageState: "failed",
        retryCount: 0,
        lastError: failure.failureReason,
      });
      throw new AuditFailureError(failure);
    }
  }

  if (staticWasBotBlocked) {
    await failNoUsablePublicEvidence(
      auditRunId,
      snapshot,
      deps,
      "Public HTML capture returned a security challenge instead of page content. No trustworthy public evidence was available for a bounded audit."
    );
  }

  // Decide whether browser is needed.
  // Browser is needed when the HTML is a JS shell (too thin) and public HTML
  // alone is not enough to produce a trustworthy bounded report.
  const staticAssessment = staticResult ? assessPublicHtmlEvidence(staticResult.html) : null;
  const needsBrowser = staticResult !== null && isJsShellHtml(staticResult.html);

  if (!needsBrowser && staticResult !== null) {
    // Rich static HTML is sufficient — store and finish without a browser.
    await completeWithStaticResult(auditRunId, snapshot, deps, staticResult, "static");
    return { limitationNote: null, browserDegraded: false };
  }

  // Phase 2: Attempt browser capture for JS-shell escalation.
  const browserSession = await getSession();

  if (!browserSession) {
    if (staticResult !== null && staticAssessment?.usable) {
      // No browser, but static HTML is available (thin but usable).
      await completeWithStaticResult(auditRunId, snapshot, deps, staticResult, "fallback_static");
      return { limitationNote: BROWSER_UNAVAILABLE_LIMITATION_NOTE, browserDegraded: true };
    }

    return await failNoUsablePublicEvidence(auditRunId, snapshot, deps);
  }

  // Phase 3: Browser capture attempt.
  try {
    await deps.auditJobs.updatePageSnapshotState({
      pageSnapshotId: snapshot.id,
      pageState: "capturing",
      retryCount: 0,
      lastError: null,
    });

    const response = await browserSession.navigate({
      url: snapshot.url,
      waitUntil: "load",
      timeoutMs: 30000,
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

    const currentUrl = await browserSession.getUrl();
    const { value: html } = await browserSession.extractHtml();
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

    const screenshot = await browserSession.screenshot({
      fullPage: true,
      format: "jpeg",
      quality: 80,
      timeoutMs: 90000,
    });

    const browserHtmlKey = await deps.storage.put(
      buildArtifactKey(auditRunId, snapshot.pageType, currentUrl, "html"),
      html,
      "text/html"
    );
    const screenshotKey = await deps.storage.put(
      buildArtifactKey(auditRunId, snapshot.pageType, currentUrl, "jpg"),
      screenshot.data,
      screenshot.contentType
    );

    await deps.auditJobs.completePageSnapshotCapture({
      pageSnapshotId: snapshot.id,
      url: currentUrl,
      htmlStorageKey: browserHtmlKey,
      screenshotStorageKey: screenshotKey,
      captureMethod: "browser",
      retryCount: 0,
    });

    return { limitationNote: null, browserDegraded: false };
  } catch (browserError) {
    const failure = toAuditFailure(browserError, {
      stage: "capture",
      url: snapshot.url,
      driver: deps.browser.name,
    });
    const isBotChallenge = failure.failureKind === "capture_blocked";

    if (staticResult !== null && staticAssessment?.usable) {
      // Browser failed but static HTML is available: use it as fallback.
      await completeWithStaticResult(auditRunId, snapshot, deps, staticResult, "fallback_static");
      const note = isBotChallenge
        ? BROWSER_BLOCKED_LIMITATION_NOTE
        : BROWSER_RUNTIME_FAILURE_LIMITATION_NOTE;
      return { limitationNote: note, browserDegraded: true };
    }

    // Browser failed and the static response was not trustworthy enough for a bounded report.
    await deps.auditJobs.updatePageSnapshotState({
      pageSnapshotId: snapshot.id,
      pageState: "failed",
      retryCount: 0,
      lastError: failure.failureReason,
    });
    await deps.auditJobs.insertAuditRunAttempt({
      auditRunId,
      pageSnapshotId: snapshot.id,
      stage: "capture",
      attempt: 1,
      failureKind: failure.failureKind,
      evaluatorFeedback: failure.failureReason,
      nextRetryStrategy: "escalate_to_failed",
    }).catch(() => undefined);
    throw new AuditFailureError(failure);
  }
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
      // If homepage is bot-blocked, a secondary static sweep is attempted instead.
      const discoveryResult = await doStaticDiscovery(baseUrl, auditRunId, maxPages, deps);

      if (discoveryResult.homepageBlocked) {
        // Homepage was bot-blocked but secondary evidence was found.
        // Skip browser capture entirely — mark as degraded so the orchestrator
        // proceeds directly to analyze the secondary pages.
        browserDegraded = true;
        limitationNote = discoveryResult.limitationNote;
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

      if (plan.captureMethod === "static_preferred") {
        // Static-first homepage: try static, escalate to browser only if HTML is thin.
        const result = await captureStaticPreferredPage(auditRunId, snapshot, deps, getSession);
        if (result.browserDegraded && !browserDegraded) {
          browserDegraded = true;
        }
        limitationNote = limitationNote ?? result.limitationNote ?? null;
      } else if (plan.captureMethod === "browser") {
        // Legacy explicit-browser path (not reached by current policy; kept for safety).
        const browserSession = await getSession();

        if (!browserSession) {
          await captureStaticPage(auditRunId, snapshot, deps, "fallback_static");
          limitationNote = limitationNote ?? BROWSER_UNAVAILABLE_LIMITATION_NOTE;
        } else {
          const result = await captureQueuedPage(browserSession, auditRunId, snapshot, deps);
          if (result.captureBlocked && !browserDegraded) {
            browserDegraded = true;
            limitationNote = limitationNote ?? BROWSER_BLOCKED_LIMITATION_NOTE;
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

/**
 * Secondary static-only public evidence sweep.
 *
 * Called when homepage capture is blocked by a bot/security challenge.
 * Probes safe public routes (robots.txt, sitemap.xml, /about, /contact, etc.)
 * using plain HTTP only — no browser, no evasion.
 *
 * Returns the number of successfully queued pages.
 * A page is queued only when it returns a non-challenge 200 OK response.
 *
 * Bounds: same-origin only, safe routes only, low page cap (maxPages - 1).
 */
async function runSecondaryStaticSweep(
  baseUrl: string,
  auditRunId: string,
  maxPages: number,
  deps: CaptureAuditRunDeps
): Promise<number> {
  const fetcher = deps.fetchStatic ?? fetchStaticPage;
  const origin = new URL(baseUrl).origin;
  let queued = 0;
  const seenPageTypes = new Set<string>();

  for (const route of SAFE_SECONDARY_ROUTES) {
    if (queued >= maxPages - 1) {
      break;
    }

    // Avoid two pages of the same type (e.g. /about and /about-us both being "about").
    if (seenPageTypes.has(route.pageType) && route.pageType !== "other") {
      continue;
    }

    const url = `${origin}${route.path}`;

    try {
      const result = await fetcher(url);

      if (!result.ok) {
        continue;
      }

      // Skip bot-challenge or auth-wall responses.
      const barrier = detectAuditCaptureBarrier({
        stage: "capture",
        statusCode: result.statusCode,
        html: result.html,
        url: result.finalUrl,
        driver: "static",
      });
      if (barrier) {
        continue;
      }

      // Skip pages with no usable public evidence (bare shells, redirect pages, etc.).
      // For robots.txt and sitemap.xml: accept only if the response is NOT an HTML page
      // (real robots.txt starts with "User-agent:" or "#"; real sitemap starts with "<?xml").
      const isMetaRoute = route.path === "/robots.txt" || route.path === "/sitemap.xml";
      const looksLikeHtmlPage = /^\s*(<html|<!doctype)/i.test(result.html);
      if (isMetaRoute) {
        if (looksLikeHtmlPage) {
          continue;
        }
      } else {
        const assessment = assessPublicHtmlEvidence(result.html);
        if (!assessment.usable) {
          continue;
        }
      }

      await deps.auditJobs.insertPageSnapshot({
        auditRunId,
        url: result.finalUrl,
        pageType: route.pageType,
        pagePriority: 50 + queued * 10, // deprioritized behind any real discovery
        pageState: "queued",
        retryCount: 0,
        lastError: null,
      });

      seenPageTypes.add(route.pageType);
      queued += 1;
    } catch {
      // Silently skip routes that time out or cannot be reached.
      continue;
    }
  }

  return queued;
}

async function doStaticDiscovery(
  baseUrl: string,
  auditRunId: string,
  maxPages: number,
  deps: CaptureAuditRunDeps
): Promise<{ homepageBlocked: boolean; limitationNote: string | null }> {
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
    // Hard access barriers (401/403/429) are not recoverable via secondary sweep.
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

  if (htmlBarrier && htmlBarrier.failureKind === "capture_blocked") {
    // Homepage is bot-blocked. Do NOT hard-fail yet.
    // Attempt a secondary static-only public evidence sweep.
    console.warn("[audit-capture] Homepage bot-blocked at discovery; attempting secondary static sweep");
    const secondaryCount = await runSecondaryStaticSweep(baseUrl, auditRunId, maxPages, deps);

    if (secondaryCount < SECONDARY_SWEEP_MIN_PAGES) {
      // No trustworthy secondary evidence either → hard-fail.
      throw new AuditFailureError(htmlBarrier);
    }

    // Secondary evidence obtained → continue as homepage-blocked partial audit.
    return { homepageBlocked: true, limitationNote: HOMEPAGE_BLOCKED_SECONDARY_SWEEP_NOTE };
  }

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

  return { homepageBlocked: false, limitationNote: null };
}
