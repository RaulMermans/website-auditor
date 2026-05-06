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
const SECONDARY_TECHNICAL_ENDPOINTS: Array<{ path: string; pageType: PageType }> = [
  { path: "/robots.txt", pageType: "other" },
  { path: "/sitemap.xml", pageType: "other" },
];
const SECONDARY_FETCH_ATTEMPT_CAP = 18;
const SITEMAP_DISCOVERY_CAP = 4;
const INTERNAL_LINK_DISCOVERY_CAP = 4;
const PROTECTED_PATH_PATTERN =
  /\/(?:account|admin|auth|basket|cart|checkout|dashboard|login|logout|my-account|order|orders|password|register|reset|signin|sign-in|signup|sign-up|user|users|wp-admin)(?:\/|$)/i;
const ASSET_PATH_PATTERN =
  /\.(?:avif|css|csv|docx?|eot|gif|ico|jpe?g|js|json|map|mp4|pdf|png|svg|webm|webp|woff2?|xlsx?|zip)$/i;

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

async function queueHomepageSnapshot(baseUrl: string, auditRunId: string, deps: CaptureAuditRunDeps) {
  const homepageUrl = new URL(baseUrl).href;
  await deps.auditJobs.insertPageSnapshot({
    auditRunId,
    url: homepageUrl,
    pageType: "homepage",
    pagePriority: 0,
    pageState: "queued",
    retryCount: 0,
    lastError: null,
  });
}

async function queueDiscoveredPagesFromLinks(options: {
  auditRunId: string;
  homepageUrl: string;
  links: BrowserDiscoveredLink[];
  maxPages: number;
  deps: CaptureAuditRunDeps;
}) {
  const { auditRunId, homepageUrl, links, maxPages, deps } = options;
  const captureTargets = buildCapturePlan(homepageUrl, links, maxPages).filter(
    (target) => target.pageType !== "homepage"
  );

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

interface SecondarySweepCandidate {
  url: string;
  pageType: PageType;
  source: "technical_endpoint" | "generic_route" | "sitemap" | "internal_link";
  priority: number;
}

function inferSecondaryPageType(pathname: string): PageType {
  const normalized = pathname.toLowerCase();
  if (/\/about(?:-us)?(?:\/|$)/.test(normalized)) return "about";
  if (/\/contact(?:-us)?(?:\/|$)/.test(normalized)) return "contact";
  if (/\/(?:services|solutions|capabilities|what-we-do|work-with-us)(?:\/|$)/.test(normalized)) {
    return "services";
  }
  if (/\/(?:pricing|plans)(?:\/|$)/.test(normalized)) return "pricing";
  if (/\/(?:privacy|terms|legal|cookies?)(?:\/|$)/.test(normalized)) return "legal";
  return "other";
}

function normalizeSecondaryCandidateUrl(rawUrl: string, baseUrl: string, origin: string): URL | null {
  try {
    const parsed = new URL(rawUrl, baseUrl);
    parsed.hash = "";

    if (parsed.origin !== origin) return null;
    if (parsed.pathname === "/") return null;
    if (parsed.search) return null;
    if (ASSET_PATH_PATTERN.test(parsed.pathname)) return null;
    if (PROTECTED_PATH_PATTERN.test(parsed.pathname)) return null;

    const depth = parsed.pathname.split("/").filter(Boolean).length;
    if (depth > 3) return null;

    return parsed;
  } catch {
    return null;
  }
}

function scoreSecondaryPublicPath(url: URL, source: SecondarySweepCandidate["source"]) {
  const path = url.pathname.toLowerCase();
  const depth = path.split("/").filter(Boolean).length;
  let score = source === "sitemap" ? 140 : source === "internal_link" ? 120 : 100;

  if (/\/(?:about|about-us|team|mission|company|who-we-are)(?:\/|$)/.test(path)) score += 40;
  if (/\/(?:contact|contact-us|booking|book|schedule|locations|stores)(?:\/|$)/.test(path)) score += 36;
  if (/\/(?:services|solutions|product|products|platform|work|portfolio|case-studies)(?:\/|$)/.test(path)) {
    score += 34;
  }
  if (/\/(?:pricing|plans|faq|help|support|resources|blog|news|insights)(?:\/|$)/.test(path)) score += 24;
  if (/\/(?:privacy|terms|legal|cookies?)(?:\/|$)/.test(path)) score -= 24;
  score -= depth * 6;

  return score;
}

function uniqueRankedCandidates(candidates: SecondarySweepCandidate[], cap: number) {
  const seen = new Set<string>();
  return candidates
    .sort((left, right) => right.priority - left.priority || left.url.localeCompare(right.url))
    .filter((candidate) => {
      if (seen.has(candidate.url)) return false;
      seen.add(candidate.url);
      return true;
    })
    .slice(0, cap);
}

function parseSitemapCandidates(xml: string, baseUrl: string, origin: string): SecondarySweepCandidate[] {
  const candidates: SecondarySweepCandidate[] = [];
  for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    const parsed = normalizeSecondaryCandidateUrl(match[1], baseUrl, origin);
    if (!parsed) continue;
    candidates.push({
      url: parsed.href,
      pageType: inferSecondaryPageType(parsed.pathname),
      source: "sitemap",
      priority: scoreSecondaryPublicPath(parsed, "sitemap"),
    });
  }
  return uniqueRankedCandidates(candidates, SITEMAP_DISCOVERY_CAP);
}

function extractInternalLinkCandidates(
  html: string,
  baseUrl: string,
  origin: string
): SecondarySweepCandidate[] {
  const candidates = extractLinksFromStaticHtml(html, baseUrl)
    .map((link) => normalizeSecondaryCandidateUrl(link.href, baseUrl, origin))
    .filter((url): url is URL => Boolean(url))
    .map((url) => ({
      url: url.href,
      pageType: inferSecondaryPageType(url.pathname),
      source: "internal_link" as const,
      priority: scoreSecondaryPublicPath(url, "internal_link"),
    }));

  return uniqueRankedCandidates(candidates, INTERNAL_LINK_DISCOVERY_CAP);
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

interface BrowserFirstResult {
  limitationNote: string | null;
  browserDegraded: boolean;
  capturedUrl?: string;
  discoveredLinks: BrowserDiscoveredLink[];
}

/**
 * Captures a homepage using browser-first policy:
 * 1. Try rendered browser capture and store rendered HTML + screenshot when it succeeds.
 * 2. If the browser is blocked, unavailable, or fails at runtime, downgrade to public static HTML.
 * 3. If static HTML is blocked or too limited, try a bounded secondary public sweep.
 * 4. If no authorized public evidence is available, fail the run without producing findings.
 */
async function captureBrowserFirstPage(
  auditRunId: string,
  snapshot: Pick<PageSnapshot, "id" | "url" | "pageType" | "retryCount" | "auditRunId">,
  deps: CaptureAuditRunDeps,
  getSession: SessionGetter
): Promise<BrowserFirstResult> {
  const fetcher = deps.fetchStatic ?? fetchStaticPage;

  await deps.auditJobs.updatePageSnapshotState({
    pageSnapshotId: snapshot.id,
    pageState: "capturing",
    retryCount: 0,
    lastError: null,
  });

  const browserSession = await getSession();

  if (!browserSession) {
    return captureStaticFallbackAfterBrowserFailure({
      auditRunId,
      snapshot,
      deps,
      fetcher,
      note: BROWSER_UNAVAILABLE_LIMITATION_NOTE,
      failureReason: "Browser rendering is unavailable in this environment.",
      secondarySweepNote: BROWSER_UNAVAILABLE_LIMITATION_NOTE,
    });
  }

  try {
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

    return {
      limitationNote: null,
      browserDegraded: false,
      capturedUrl: currentUrl,
      discoveredLinks: extractLinksFromStaticHtml(html, currentUrl),
    };
  } catch (browserError) {
    const failure = toAuditFailure(browserError, {
      stage: "capture",
      url: snapshot.url,
      driver: deps.browser.name,
    });
    const isBotChallenge = failure.failureKind === "capture_blocked";

    return captureStaticFallbackAfterBrowserFailure({
      auditRunId,
      snapshot,
      deps,
      fetcher,
      note: isBotChallenge ? BROWSER_BLOCKED_LIMITATION_NOTE : BROWSER_RUNTIME_FAILURE_LIMITATION_NOTE,
      failureReason: failure.failureReason,
      secondarySweepNote: isBotChallenge
        ? HOMEPAGE_BLOCKED_SECONDARY_SWEEP_NOTE
        : BROWSER_RUNTIME_FAILURE_LIMITATION_NOTE,
    });
  }
}

async function captureStaticFallbackAfterBrowserFailure(options: {
  auditRunId: string;
  snapshot: Pick<PageSnapshot, "id" | "url" | "pageType" | "retryCount" | "auditRunId">;
  deps: CaptureAuditRunDeps;
  fetcher: typeof fetchStaticPage;
  note: string;
  failureReason: string;
  secondarySweepNote: string;
}): Promise<BrowserFirstResult> {
  const { auditRunId, snapshot, deps, fetcher, note, failureReason, secondarySweepNote } = options;

  try {
    const staticResult = await fetcher(snapshot.url);
    if (!staticResult.ok) {
      throw new Error(`Static fetch failed. Status: ${staticResult.statusCode}`);
    }

    const staticBarrier = detectAuditCaptureBarrier({
      stage: "capture",
      statusCode: staticResult.statusCode,
      html: staticResult.html,
      url: staticResult.finalUrl,
      driver: "static",
    });
    if (staticBarrier) {
      throw new AuditFailureError(staticBarrier);
    }

    const staticAssessment = assessPublicHtmlEvidence(staticResult.html);
    if (!staticAssessment.usable) {
      throw new Error(NO_USABLE_PUBLIC_HTML_REASON);
    }

    await completeWithStaticResult(auditRunId, snapshot, deps, staticResult, "fallback_static");
    return {
      limitationNote: note,
      browserDegraded: true,
      capturedUrl: staticResult.finalUrl,
      discoveredLinks: extractLinksFromStaticHtml(staticResult.html, staticResult.finalUrl),
    };
  } catch (staticError) {
    const staticFailure = toAuditFailure(staticError, {
      stage: "capture",
      url: snapshot.url,
      driver: "static",
    });

    if (
      staticFailure.failureKind === "access_denied" ||
      staticFailure.failureKind === "auth_wall"
    ) {
      await deps.auditJobs.updatePageSnapshotState({
        pageSnapshotId: snapshot.id,
        pageState: "failed",
        retryCount: snapshot.retryCount ?? 0,
        lastError: staticFailure.failureReason,
      });
      throw new AuditFailureError(staticFailure);
    }

    console.warn("[audit-capture] Browser-first capture and static fallback failed; attempting secondary static sweep");
    const secondaryCount = await runSecondaryStaticSweep(snapshot.url, auditRunId, 5, deps);
    if (secondaryCount >= SECONDARY_SWEEP_MIN_PAGES) {
      await deps.auditJobs.updatePageSnapshotState({
        pageSnapshotId: snapshot.id,
        pageState: "failed",
        retryCount: snapshot.retryCount ?? 0,
        lastError: failureReason,
      });
      return {
        limitationNote: secondarySweepNote,
        browserDegraded: true,
        discoveredLinks: [],
      };
    }

    return await failNoUsablePublicEvidence(
      auditRunId,
      snapshot,
      deps,
      staticFailure.failureKind === "capture_blocked"
        ? "Public static fallback returned a security challenge after browser capture failed. No trustworthy public evidence was available for a bounded audit."
        : failureReason
    );
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

      // Browser-first milestone: queue the homepage without fetching it statically.
      // Link discovery happens after rendered capture, or from authorized static
      // fallback HTML if browser capture degrades.
      await queueHomepageSnapshot(baseUrl, auditRunId, deps);

      progress = await deps.auditJobs.getAuditRunProgress(auditRunId);
    }

    let captureTargets = progress.pageSnapshots
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

    while (captureTargets.length > 0) {
      for (const snapshot of captureTargets) {
        const plan = planCaptureMethod({ pageType: snapshot.pageType, browserDegraded });

        if (plan.captureMethod === "browser_first") {
          const result = await captureBrowserFirstPage(auditRunId, snapshot, deps, getSession);
          if (result.browserDegraded && !browserDegraded) {
            browserDegraded = true;
          }
          limitationNote = limitationNote ?? result.limitationNote ?? null;
          if (result.capturedUrl && result.discoveredLinks.length > 0) {
            await queueDiscoveredPagesFromLinks({
              auditRunId,
              homepageUrl: result.capturedUrl,
              links: result.discoveredLinks,
              maxPages,
              deps,
            });
          }
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
          const method =
            browserDegraded &&
            limitationNote === HOMEPAGE_BLOCKED_SECONDARY_SWEEP_NOTE &&
            snapshot.pageType !== "homepage"
              ? "secondary_static"
              : (plan.captureMethod as CaptureMethodProvenance);
          await captureStaticPage(auditRunId, snapshot, deps, method);
        }
      }

      progress = await deps.auditJobs.getAuditRunProgress(auditRunId);
      captureTargets = progress.pageSnapshots
        .filter(
          (snapshot) => snapshot.pageState && CAPTURE_PENDING_STATES.has(snapshot.pageState)
        )
        .sort(compareSnapshots);
    }

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
    });

    return {
      ...summary,
      limitationNote: null,
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
 * Uses plain HTTP only — no browser, no evasion. Discovery order:
 * universal technical endpoints, sitemap URLs, compact generic routes, then
 * low-depth internal links from any accessible HTML found during the sweep.
 *
 * Returns the number of successfully queued pages.
 * A page is queued only when it returns a non-challenge 200 OK response.
 *
 * Bounds: same-origin only, no query strings, protected paths/assets skipped,
 * low fetch and page caps.
 */
async function runSecondaryStaticSweep(
  baseUrl: string,
  auditRunId: string,
  maxPages: number,
  deps: CaptureAuditRunDeps
): Promise<number> {
  const fetcher = deps.fetchStatic ?? fetchStaticPage;
  const origin = new URL(baseUrl).origin;
  const pageCap = Math.max(0, maxPages - 1);
  let queued = 0;
  let attempted = 0;
  const seenPageTypes = new Set<string>();
  const fetchedUrls = new Set<string>();
  const queuedUrls = new Set<string>();
  const sitemapCandidates: SecondarySweepCandidate[] = [];
  const internalLinkCandidates: SecondarySweepCandidate[] = [];

  async function tryCandidate(candidate: SecondarySweepCandidate): Promise<void> {
    if (queued >= pageCap || attempted >= SECONDARY_FETCH_ATTEMPT_CAP) return;
    if (fetchedUrls.has(candidate.url)) return;

    // Avoid two pages of the same type (e.g. /about and /about-us both being "about").
    if (seenPageTypes.has(candidate.pageType) && candidate.pageType !== "other") return;

    fetchedUrls.add(candidate.url);
    attempted += 1;

    try {
      const result = await fetcher(candidate.url);

      if (!result.ok) {
        return;
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
        return;
      }

      const isMetaRoute =
        candidate.url === `${origin}/robots.txt` || candidate.url === `${origin}/sitemap.xml`;
      const looksLikeHtmlPage = /^\s*(<html|<!doctype)/i.test(result.html);
      if (isMetaRoute) {
        if (looksLikeHtmlPage) {
          return;
        }
      } else {
        const assessment = assessPublicHtmlEvidence(result.html);
        if (!assessment.usable) {
          return;
        }

        internalLinkCandidates.push(...extractInternalLinkCandidates(result.html, result.finalUrl, origin));
      }

      if (candidate.url === `${origin}/sitemap.xml`) {
        sitemapCandidates.push(...parseSitemapCandidates(result.html, result.finalUrl, origin));
      }

      const normalizedFinalUrl = normalizeSecondaryCandidateUrl(result.finalUrl, candidate.url, origin);
      if (!normalizedFinalUrl) return;
      const finalUrl = normalizedFinalUrl.href;
      if (queuedUrls.has(finalUrl)) return;

      await deps.auditJobs.insertPageSnapshot({
        auditRunId,
        url: finalUrl,
        pageType: candidate.pageType,
        pagePriority: 50 + queued * 10,
        pageState: "queued",
        retryCount: 0,
        lastError: null,
      });

      seenPageTypes.add(candidate.pageType);
      queuedUrls.add(finalUrl);
      queued += 1;
    } catch {
      // Silently skip routes that time out or cannot be reached.
    }
  }

  for (const endpoint of SECONDARY_TECHNICAL_ENDPOINTS) {
    await tryCandidate({
      url: `${origin}${endpoint.path}`,
      pageType: endpoint.pageType,
      source: "technical_endpoint",
      priority: endpoint.path === "/sitemap.xml" ? 220 : 210,
    });
  }

  for (const candidate of uniqueRankedCandidates(sitemapCandidates, SITEMAP_DISCOVERY_CAP)) {
    await tryCandidate(candidate);
  }

  for (const route of SAFE_SECONDARY_ROUTES) {
    await tryCandidate({
      url: `${origin}${route.path}`,
      pageType: route.pageType,
      source: "generic_route",
      priority: scoreSecondaryPublicPath(new URL(`${origin}${route.path}`), "generic_route"),
    });
  }

  for (const candidate of uniqueRankedCandidates(internalLinkCandidates, INTERNAL_LINK_DISCOVERY_CAP)) {
    await tryCandidate(candidate);
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
