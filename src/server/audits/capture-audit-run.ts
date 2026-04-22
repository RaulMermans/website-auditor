import type { AuditJobRepository } from "@/db/audits";
import { auditJobRepository } from "@/db/audits";
import type { StorageClient } from "@/server/contracts/storage";
import { storageClient } from "@/server/contracts/storage";
import type { PageType } from "@/lib/types";
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

interface DiscoveredPage {
  url: string;
  type: PageType;
}

export interface CaptureAuditRunDeps {
  auditJobs: Pick<AuditJobRepository, "updateAuditRunStatus" | "insertPageSnapshot">;
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

function classifyPageTarget(url: string, linkText: string): PageType {
  const normalizedText = linkText.toLowerCase().trim();
  const normalizedPath = new URL(url).pathname.toLowerCase();

  if (normalizedPath === "/" || normalizedPath === "/home") {
    return "homepage";
  }

  if (
    normalizedText.includes("about") ||
    normalizedPath.includes("/about") ||
    normalizedPath.includes("/company") ||
    normalizedPath.includes("/our-story")
  ) {
    return "about";
  }

  if (
    normalizedText.includes("service") ||
    normalizedText.includes("product") ||
    normalizedText.includes("solution") ||
    normalizedPath.includes("/services") ||
    normalizedPath.includes("/products") ||
    normalizedPath.includes("/solutions")
  ) {
    return "services";
  }

  if (
    normalizedText.includes("contact") ||
    normalizedText.includes("book") ||
    normalizedPath.includes("/contact") ||
    normalizedPath.includes("/book")
  ) {
    return "contact";
  }

  if (
    normalizedText.includes("blog") ||
    normalizedPath.includes("/blog") ||
    normalizedPath.includes("/article") ||
    normalizedPath.includes("/resources")
  ) {
    return "content";
  }

  return "other";
}

async function discoverPriorityPages(session: BrowserSession, domain: string): Promise<DiscoveredPage[]> {
  const baseUrl = domain.startsWith("http") ? domain : `https://${domain}`;
  const { value: links } = await session.evaluate<BrowserDiscoveredLink[], { baseUrl: string }>({
    expression: DISCOVER_LINKS_EXPRESSION,
    arg: { baseUrl },
  });

  const baseOrigin = new URL(baseUrl).origin;
  const discovered: DiscoveredPage[] = [];
  const seenUrls = new Set<string>([baseUrl]);
  const internalLinks = links.filter((link) => {
    if (link.origin !== baseOrigin) {
      return false;
    }

    if (link.href.includes("#") || seenUrls.has(link.href)) {
      return false;
    }

    if (link.pathname.match(/\.(png|jpg|jpeg|gif|pdf|doc|css|js|mp4)$/i)) {
      return false;
    }

    seenUrls.add(link.href);
    return true;
  });

  const categoriesSelected = new Set<PageType>();
  for (const link of internalLinks) {
    if (discovered.length >= DEFAULT_MAX_PAGES - 1) {
      break;
    }

    const type = classifyPageTarget(link.href, link.text);
    if (type !== "other" && type !== "homepage" && !categoriesSelected.has(type)) {
      discovered.push({ url: link.href, type });
      categoriesSelected.add(type);
    }
  }

  if (discovered.length < DEFAULT_MAX_PAGES - 1) {
    for (const link of internalLinks) {
      if (discovered.length >= DEFAULT_MAX_PAGES - 1) {
        break;
      }

      const type = classifyPageTarget(link.href, link.text);
      if (type === "other" && !discovered.find((entry) => entry.url === link.href)) {
        discovered.push({ url: link.href, type });
      }
    }
  }

  return discovered;
}

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

    const discovered = await discoverPriorityPages(session, baseUrl);
    const captureQueue = [{ url: response.url, type: "homepage" as const }, ...discovered].slice(0, maxPages);

    await deps.auditJobs.updateAuditRunStatus({
      auditRunId,
      status: "capturing",
    });

    for (const target of captureQueue) {
      try {
        if (target.type !== "homepage") {
          await session.navigate({
            url: target.url,
            waitUntil: "load",
            timeoutMs: 20000,
          });
        }

        await deps.waitAfterNavigation(2000);

        const currentUrl = await session.getUrl();
        const { value: html } = await session.extractHtml();

        console.log(`[audit-capture] taking screenshot: ${target.url}`);
        const screenshot = await session.screenshot({
          fullPage: true,
          format: "jpeg",
          quality: 80,
          timeoutMs: 90000,
        });
        console.log("[audit-capture] screenshot captured");

        const htmlStorageKey = await deps.storage.put(
          buildArtifactKey(auditRunId, target.type, currentUrl, "html"),
          html,
          "text/html"
        );
        const screenshotStorageKey = await deps.storage.put(
          buildArtifactKey(auditRunId, target.type, currentUrl, "jpg"),
          screenshot.data,
          screenshot.contentType
        );

        await deps.auditJobs.insertPageSnapshot({
          auditRunId,
          url: currentUrl,
          pageType: target.type,
          htmlStorageKey,
          screenshotStorageKey,
        });

        pagesProcessed += 1;
        if (target.type !== "homepage") {
          homepageOnly = false;
        }
      } catch (error) {
        console.error(`[audit-capture] Failed to capture ${target.url}`, error);
        if (target.type === "homepage") {
          throw error;
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
