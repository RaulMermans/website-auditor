import type { AuditJobRepository, AuditRunProgress } from "@/db/audits";
import { auditJobRepository } from "@/db/audits";
import {
  AuditFailureError,
  detectAuditCaptureBarrier,
  toAuditFailure,
} from "@/lib/audit-failure";
import type { StorageClient } from "@/server/contracts/storage";
import { storageClient } from "@/server/contracts/storage";
import type { PageSnapshot, PageState, PageType } from "@/lib/types";
import { buildCapturePlan, getPagePriority } from "@/server/audits/page-archetypes";
import { browserDriver } from "@/server/browser/create-browser-driver";
import type {
  BrowserDiscoveredLink,
  BrowserDriver,
  BrowserSession,
} from "@/server/browser/types";

const DEFAULT_MAX_PAGES = 5;
const CAPTURE_PENDING_STATES = new Set<PageState>(["queued", "capturing"]);
const DISCOVER_LINKS_EXPRESSION = `({ baseUrl }) => {
  const anchors = Array.from(document.querySelectorAll("a"));
  return anchors
    .map((anchor) => {
      try {
        const url = new URL(anchor.href, baseUrl);
        return {
          href: url.href,
          origin: url.origin,
          pathname: url.pathname,
          text: (anchor.innerText || "").trim(),
        };
      } catch {
        return null;
      }
    })
    .filter((link) => Boolean(link));
}`;

export interface AuditCaptureRequest {
  auditRunId: string;
  domain: string;
  maxPages?: number;
}

export interface AuditCaptureResult {
  auditRunId: string;
  pagesProcessed: number;
  homepageOnly: boolean;
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
  >;
  storage: Pick<StorageClient, "put">;
  browser: BrowserDriver;
  waitAfterNavigation: (timeoutMs: number) => Promise<void>;
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

function summarizeCaptureProgress(progress: AuditRunProgress): AuditCaptureResult {
  const capturedPages = progress.pageSnapshots.filter((snapshot) => snapshot.htmlStorageKey);
  const homepageOnly = !progress.pageSnapshots.some(
    (snapshot) => snapshot.pageType !== "homepage" && snapshot.htmlStorageKey
  );

  return {
    auditRunId: progress.auditRun.id,
    pagesProcessed: capturedPages.length,
    homepageOnly,
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

async function captureQueuedPage(
  session: BrowserSession,
  auditRunId: string,
  snapshot: Pick<PageSnapshot, "id" | "url" | "pageType" | "retryCount">,
  deps: CaptureAuditRunDeps
) {
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
        retryCount: attempt,
      });

      return true;
    } catch (error) {
      const failure = toAuditFailure(error, {
        stage: "capture",
        url: snapshot.url,
        driver: deps.browser.name,
      });
      const failureReason = failure.failureReason;

      if (attempt === 0) {
        await deps.auditJobs.updatePageSnapshotState({
          pageSnapshotId: snapshot.id,
          pageState: "queued",
          retryCount: 1,
          lastError: failureReason,
        });
        continue;
      }

      await deps.auditJobs.updatePageSnapshotState({
        pageSnapshotId: snapshot.id,
        pageState: snapshot.pageType === "homepage" ? "failed" : "needs_review",
        retryCount: 1,
        lastError: failureReason,
      });

      if (snapshot.pageType === "homepage") {
        throw new AuditFailureError(failure);
      }

      console.error(`[audit-capture] Failed to capture ${snapshot.url}`, error);
      return false;
    }
  }

  return false;
}

export async function captureAuditRun(
  request: AuditCaptureRequest,
  deps: CaptureAuditRunDeps = defaultDeps
): Promise<AuditCaptureResult> {
  const { auditRunId, domain, maxPages = DEFAULT_MAX_PAGES } = request;
  const baseUrl = domain.startsWith("http") ? domain : `https://${domain}`;

  let session: BrowserSession | undefined;
  let progress: AuditRunProgress | null = null;

  try {
    progress = await deps.auditJobs.getAuditRunProgress(auditRunId);
    session = await deps.browser.createSession();

    if (shouldDiscoverPages(progress)) {
      await deps.auditJobs.updateAuditRunStatus({
        auditRunId,
        status: "discovering",
      });

      const response = await session.navigate({
        url: baseUrl,
        waitUntil: "load",
        timeoutMs: 30000,
      });
      const discoveryStatusBarrier = detectAuditCaptureBarrier({
        stage: "discover",
        statusCode: response.status,
        url: response.url,
        driver: deps.browser.name,
      });
      if (discoveryStatusBarrier) {
        throw new AuditFailureError(discoveryStatusBarrier);
      }

      if (!response.ok) {
        throw new Error(`Failed to load homepage. Status: ${response.status}`);
      }

      const { value: homepageHtml } = await session.extractHtml();
      const discoveryHtmlBarrier = detectAuditCaptureBarrier({
        stage: "discover",
        statusCode: response.status,
        html: homepageHtml,
        url: response.url,
        driver: deps.browser.name,
      });
      if (discoveryHtmlBarrier) {
        throw new AuditFailureError(discoveryHtmlBarrier);
      }

      let captureTargets = buildCapturePlan(response.url, [], maxPages);

      try {
        const { value: discoveredLinks } = await session.evaluate<
          BrowserDiscoveredLink[],
          { baseUrl: string }
        >({
          expression: DISCOVER_LINKS_EXPRESSION,
          arg: { baseUrl },
        });

        captureTargets = buildCapturePlan(response.url, discoveredLinks, maxPages);
      } catch (error) {
        console.warn(
          "[audit-capture] Discovery failed, falling back to homepage-only capture",
          error
        );
      }

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

      progress = await deps.auditJobs.getAuditRunProgress(auditRunId);
    }

    const captureTargets = progress.pageSnapshots
      .filter(
        (snapshot) => snapshot.pageState && CAPTURE_PENDING_STATES.has(snapshot.pageState)
      )
      .sort(compareSnapshots);

    if (captureTargets.length === 0) {
      return summarizeCaptureProgress(progress);
    }

    await deps.auditJobs.updateAuditRunStatus({
      auditRunId,
      status: "capturing",
      homepageOnly: summarizeCaptureProgress(progress).homepageOnly,
    });

    for (const snapshot of captureTargets) {
      await captureQueuedPage(session, auditRunId, snapshot, deps);
    }

    progress = await deps.auditJobs.getAuditRunProgress(auditRunId);
    return summarizeCaptureProgress(progress);
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
      ? summarizeCaptureProgress(refreshedProgress)
      : {
          auditRunId,
          pagesProcessed: 0,
          homepageOnly: true,
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
      errorMessage: failure.failureReason,
    };
  } finally {
    await session?.close().catch(() => undefined);
  }
}
