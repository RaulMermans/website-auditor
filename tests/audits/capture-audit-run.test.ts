import { afterEach, describe, expect, it, vi } from "vitest";
import { captureAuditRun } from "@/server/audits/capture-audit-run";
import { normalizePlaywrightChromiumLaunchError } from "@/server/browser/playwright-chromium-driver";

afterEach(() => {
  vi.restoreAllMocks();
});

function createDeps(options?: {
  links?: Array<{ href: string; origin: string; pathname: string; text: string }>;
  failingUrls?: Record<string, number>;
  homepageOk?: boolean;
}) {
  const links = options?.links ?? [];
  const failingUrls = new Map(Object.entries(options?.failingUrls ?? {}));
  let currentUrl = "about:blank";
  let snapshotIndex = 0;

  const session = {
    navigate: vi.fn(async ({ url }: { url: string }) => {
      currentUrl = url;

      const remainingFailures = failingUrls.get(url) ?? 0;
      if (remainingFailures > 0) {
        failingUrls.set(url, remainingFailures - 1);
        throw new Error(`Failed to capture ${url}`);
      }

      return {
        url,
        ok: options?.homepageOk !== false,
        status: options?.homepageOk === false ? 500 : 200,
      };
    }),
    getUrl: vi.fn(async () => currentUrl),
    extractHtml: vi.fn(async () => ({ value: `<html data-url="${currentUrl}"></html>` })),
    screenshot: vi.fn().mockResolvedValue({
      data: Buffer.from("fake-image"),
      contentType: "image/jpeg",
    }),
    evaluate: vi.fn().mockResolvedValue({ value: links }),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const deps = {
    auditJobs: {
      updateAuditRunStatus: vi.fn().mockResolvedValue(undefined),
      insertPageSnapshot: vi.fn().mockImplementation(async (input: any) => ({
        id: `snapshot-${++snapshotIndex}`,
        auditRunId: input.auditRunId,
        url: input.url,
        pageType: input.pageType,
        pagePriority: input.pagePriority,
        pageState: input.pageState,
        retryCount: input.retryCount,
        lastError: input.lastError,
        htmlStorageKey: input.htmlStorageKey,
        screenshotStorageKey: input.screenshotStorageKey,
        capturedAt: input.capturedAt ?? null,
      })),
      updatePageSnapshotState: vi.fn().mockImplementation(async (input: any) => ({
        id: input.pageSnapshotId,
        auditRunId: "run",
        url: currentUrl,
        pageType: "homepage",
        pagePriority: 0,
        pageState: input.pageState,
        retryCount: input.retryCount ?? 0,
        lastError: input.lastError,
        capturedAt: null,
      })),
      completePageSnapshotCapture: vi.fn().mockImplementation(async (input: any) => ({
        id: input.pageSnapshotId,
        auditRunId: "run",
        url: input.url,
        pageType: "homepage",
        pagePriority: 0,
        pageState: "captured",
        retryCount: input.retryCount ?? 0,
        lastError: null,
        htmlStorageKey: input.htmlStorageKey,
        screenshotStorageKey: input.screenshotStorageKey,
        capturedAt: new Date(),
      })),
    },
    storage: {
      put: vi.fn().mockImplementation(async (key: string) => key),
    },
    browser: {
      name: "playwright" as const,
      createSession: vi.fn().mockResolvedValue(session),
    },
    waitAfterNavigation: vi.fn().mockResolvedValue(undefined),
  };

  return { deps, session };
}

describe("captureAuditRun", () => {
  it("captures the homepage and updates run state", async () => {
    const { deps } = createDeps();

    const result = await captureAuditRun(
      {
        auditRunId: "run-123",
        domain: "example.com",
      },
      deps
    );

    expect(result).toEqual({
      auditRunId: "run-123",
      pagesProcessed: 1,
      homepageOnly: true,
    });
    expect(deps.auditJobs.updateAuditRunStatus).toHaveBeenNthCalledWith(1, {
      auditRunId: "run-123",
      status: "discovering",
    });
    expect(deps.auditJobs.updateAuditRunStatus).toHaveBeenNthCalledWith(2, {
      auditRunId: "run-123",
      status: "capturing",
    });
    expect(deps.auditJobs.insertPageSnapshot).toHaveBeenCalledWith({
      auditRunId: "run-123",
      url: "https://example.com/",
      pageType: "homepage",
      pagePriority: 0,
      pageState: "queued",
      retryCount: 0,
      lastError: null,
    });
    expect(deps.auditJobs.completePageSnapshotCapture).toHaveBeenCalledWith({
      pageSnapshotId: "snapshot-1",
      url: "https://example.com",
      htmlStorageKey: "audit-runs/run-123/homepage/root.html",
      screenshotStorageKey: "audit-runs/run-123/homepage/root.jpg",
      retryCount: 0,
    });
  });

  it("discovers priority pages and skips a failing secondary capture", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { deps } = createDeps({
      links: [
        {
          href: "https://example.com/about",
          origin: "https://example.com",
          pathname: "/about",
          text: "About",
        },
        {
          href: "https://example.com/services",
          origin: "https://example.com",
          pathname: "/services",
          text: "Services",
        },
        {
          href: "https://example.com/contact",
          origin: "https://example.com",
          pathname: "/contact",
          text: "Contact",
        },
        {
          href: "https://example.com/blog",
          origin: "https://example.com",
          pathname: "/blog",
          text: "Blog",
        },
      ],
      failingUrls: { "https://example.com/services": 2 },
    });

    const result = await captureAuditRun(
      {
        auditRunId: "run-456",
        domain: "example.com",
      },
      deps
    );

    expect(result.auditRunId).toBe("run-456");
    expect(result.pagesProcessed).toBe(4);
    expect(result.homepageOnly).toBe(false);
    expect(deps.auditJobs.insertPageSnapshot).toHaveBeenCalledTimes(5);
    expect(deps.auditJobs.insertPageSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        pageType: "about",
        url: "https://example.com/about",
      })
    );
    expect(deps.auditJobs.insertPageSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        pageType: "contact",
        url: "https://example.com/contact",
      })
    );
    expect(deps.auditJobs.insertPageSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        pageType: "blog_article",
        url: "https://example.com/blog",
      })
    );
    expect(deps.auditJobs.updatePageSnapshotState).toHaveBeenCalledWith(
      expect.objectContaining({
        pageState: "needs_review",
        retryCount: 1,
        lastError: "Failed to capture https://example.com/services",
      })
    );
  });

  it("fills remaining capture slots with other internal pages", async () => {
    const { deps } = createDeps({
      links: [
        {
          href: "https://example.com/team",
          origin: "https://example.com",
          pathname: "/team",
          text: "Team",
        },
      ],
    });

    const result = await captureAuditRun(
      {
        auditRunId: "run-789",
        domain: "example.com",
      },
      deps
    );

    expect(result.pagesProcessed).toBe(2);
    expect(result.homepageOnly).toBe(false);
    expect(deps.auditJobs.insertPageSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        pageType: "about",
        url: "https://example.com/team",
      })
    );
  });

  it("retries a recoverable secondary-page failure once before succeeding", async () => {
    const { deps } = createDeps({
      links: [
        {
          href: "https://example.com/contact",
          origin: "https://example.com",
          pathname: "/contact",
          text: "Contact",
        },
      ],
      failingUrls: { "https://example.com/contact": 1 },
    });

    const result = await captureAuditRun(
      {
        auditRunId: "run-retry",
        domain: "example.com",
      },
      deps
    );

    expect(result.pagesProcessed).toBe(2);
    expect(deps.auditJobs.updatePageSnapshotState).toHaveBeenCalledWith({
      pageSnapshotId: "snapshot-2",
      pageState: "queued",
      retryCount: 1,
      lastError: "Failed to capture https://example.com/contact",
    });
    expect(deps.auditJobs.completePageSnapshotCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        pageSnapshotId: "snapshot-2",
        retryCount: 1,
        url: "https://example.com/contact",
      })
    );
  });

  it("marks the run failed when the homepage cannot be loaded", async () => {
    const { deps } = createDeps({ homepageOk: false });

    const result = await captureAuditRun(
      {
        auditRunId: "run-999",
        domain: "example.com",
      },
      deps
    );

    expect(result.auditRunId).toBe("run-999");
    expect(result.pagesProcessed).toBe(0);
    expect(result.homepageOnly).toBe(true);
    expect(result.errorMessage).toMatch(/Failed to load homepage/);
    expect(deps.auditJobs.updateAuditRunStatus).toHaveBeenLastCalledWith({
      auditRunId: "run-999",
      status: "failed",
      failureReason: "Failed to load homepage. Status: 500",
      homepageOnly: true,
    });
  });

  it("marks the run failed when Chromium is unavailable in the runtime", async () => {
    const { deps } = createDeps();
    deps.browser.createSession = vi.fn().mockRejectedValue(
      normalizePlaywrightChromiumLaunchError(
        new Error("browserType.launch: Executable doesn't exist at /var/task/.cache/ms-playwright/chromium")
      )
    );

    const result = await captureAuditRun(
      {
        auditRunId: "run-browser-missing",
        domain: "example.com",
      },
      deps
    );

    expect(result.auditRunId).toBe("run-browser-missing");
    expect(result.pagesProcessed).toBe(0);
    expect(result.homepageOnly).toBe(true);
    expect(result.errorMessage).toMatch(/Playwright Chromium is unavailable in this deployment/);
    expect(result.errorMessage).toMatch(/Executable doesn't exist/);
    expect(deps.auditJobs.updateAuditRunStatus).toHaveBeenLastCalledWith({
      auditRunId: "run-browser-missing",
      status: "failed",
      failureReason: expect.stringContaining("Playwright Chromium is unavailable in this deployment"),
      homepageOnly: true,
    });
  });
});
