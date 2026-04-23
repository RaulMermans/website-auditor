import type { AuditJobRepository } from "@/db/audits";
import { auditJobRepository } from "@/db/audits";
import type { StorageClient } from "@/server/contracts/storage";
import { storageClient } from "@/server/contracts/storage";
import type { PageType } from "@/lib/types";
import { buildCapturePlan, type RoutedPageTarget } from "@/server/audits/page-archetypes";
import { browserDriver } from "@/server/browser/create-browser-driver";
import type {
  BrowserDiscoveredLink,
  BrowserDriver,
  BrowserSession,
} from "@/server/browser/types";

const DEFAULT_MAX_PAGES = 5;
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

async function captureQueuedPage(
  session: BrowserSession,
  auditRunId: string,
  target: RoutedPageTarget & { snapshotId: string },
  deps: CaptureAuditRunDeps
) {
  for (let attempt = 0; attempt <= 1; attempt += 1) {
    await deps.auditJobs.updatePageSnapshotState({
      pageSnapshotId: target.snapshotId,
      pageState: "capturing",
      retryCount: attempt,
      lastError: null,
    });

    try {
      if (!(target.pageType === "homepage" && attempt === 0)) {
        const response = await session.navigate({
          url: target.url,
          waitUntil: "load",
          timeoutMs: target.pageType === "homepage" ? 30000 : 20000,
        });

        if (!response.ok) {
          throw new Error(`Failed to load ${target.url}. Status: ${response.status}`);
        }
      }

      await deps.waitAfterNavigation(2000);

      const currentUrl = await session.getUrl();
      const { value: html } = await session.extractHtml();

      const screenshot = await session.screenshot({
        fullPage: true,
        format: "jpeg",
        quality: 80,
        timeoutMs: 90000,
      });

      const htmlStorageKey = await deps.storage.put(
        buildArtifactKey(auditRunId, target.pageType, currentUrl, "html"),
        html,
        "text/html"
      );
      const screenshotStorageKey = await deps.storage.put(
        buildArtifactKey(auditRunId, target.pageType, currentUrl, "jpg"),
        screenshot.data,
        screenshot.contentType
      );

      await deps.auditJobs.completePageSnapshotCapture({
        pageSnapshotId: target.snapshotId,
        url: currentUrl,
        htmlStorageKey,
        screenshotStorageKey,
        retryCount: attempt,
      });

      return true;
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : String(error);

      if (attempt === 0) {
        await deps.auditJobs.updatePageSnapshotState({
          pageSnapshotId: target.snapshotId,
          pageState: "queued",
          retryCount: 1,
          lastError: failureReason,
        });
        continue;
      }

      await deps.auditJobs.updatePageSnapshotState({
        pageSnapshotId: target.snapshotId,
        pageState: target.pageType === "homepage" ? "failed" : "needs_review",
        retryCount: 1,
        lastError: failureReason,
      });

      if (target.pageType === "homepage") {
        throw error;
      }

      console.error(`[audit-capture] Failed to capture ${target.url}`, error);
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

  await deps.auditJobs.updateAuditRunStatus({
    auditRunId,
    status: "discovering",
  });

  let session: BrowserSession | undefined;
  let homepageOnly = true;
  let pagesProcessed = 0;

  try {
    session = await deps.browser.createSession();

    const response = await session.navigate({
      url: baseUrl,
      waitUntil: "load",
      timeoutMs: 30000,
    });

    if (!response.ok) {
      throw new Error(`Failed to load homepage. Status: ${response.status}`);
    }

    const { value: discoveredLinks } = await session.evaluate<
      BrowserDiscoveredLink[],
      { baseUrl: string }
    >({
      expression: DISCOVER_LINKS_EXPRESSION,
      arg: { baseUrl },
    });
    const captureQueue = buildCapturePlan(response.url, discoveredLinks, maxPages);
    const queuedPages = await Promise.all(
      captureQueue.map(async (target) => {
        const snapshot = await deps.auditJobs.insertPageSnapshot({
          auditRunId,
          url: target.url,
          pageType: target.pageType,
          pagePriority: target.pagePriority,
          pageState: "queued",
          retryCount: 0,
          lastError: null,
        });

        return {
          ...target,
          snapshotId: snapshot.id,
        };
      })
    );

    await deps.auditJobs.updateAuditRunStatus({
      auditRunId,
      status: "capturing",
    });

    for (const target of queuedPages) {
      const captured = await captureQueuedPage(session, auditRunId, target, deps);

      if (captured) {
        pagesProcessed += 1;
        if (target.pageType !== "homepage") {
          homepageOnly = false;
        }
      }
    }

    return {
      auditRunId,
      pagesProcessed,
      homepageOnly,
    };
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : String(error);
    await deps.auditJobs.updateAuditRunStatus({
      auditRunId,
      status: "failed",
      failureReason,
      homepageOnly: true,
    });

    return {
      auditRunId,
      pagesProcessed,
      homepageOnly: true,
      errorMessage: failureReason,
    };
  } finally {
    await session?.close().catch(() => undefined);
  }
}
