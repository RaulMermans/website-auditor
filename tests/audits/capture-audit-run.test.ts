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
  statusByUrl?: Record<string, number>;
  htmlByUrl?: Record<string, string>;
  initialStatus?: "pending" | "discovering" | "capturing" | "analyzing" | "complete" | "failed";
  existingSnapshots?: Array<Record<string, unknown>>;
}) {
  const links = options?.links ?? [];
  const failingUrls = new Map(Object.entries(options?.failingUrls ?? {}));
  const statusByUrl = new Map(Object.entries(options?.statusByUrl ?? {}));
  const htmlByUrl = new Map(Object.entries(options?.htmlByUrl ?? {}));
  let currentUrl = "about:blank";
  let snapshotIndex = 0;
  let runStatus =
    options?.initialStatus ?? (options?.existingSnapshots?.length ? "capturing" : "pending");
  let homepageOnly = true;
  let failureReason: string | null = null;
  const snapshots = new Map<string, any>();

  for (const snapshot of options?.existingSnapshots ?? []) {
    snapshots.set(String(snapshot.id), { ...snapshot });
    const numericId = Number.parseInt(String(snapshot.id).replace("snapshot-", ""), 10);
    if (Number.isFinite(numericId)) {
      snapshotIndex = Math.max(snapshotIndex, numericId);
    }
  }

  const session = {
    navigate: vi.fn(async ({ url }: { url: string }) => {
      currentUrl = url;

      const remainingFailures = failingUrls.get(url) ?? 0;
      if (remainingFailures > 0) {
        failingUrls.set(url, remainingFailures - 1);
        throw new Error(`Failed to capture ${url}`);
      }

      const status = statusByUrl.get(url) ?? (options?.homepageOk === false ? 500 : 200);

      return {
        url,
        ok: status >= 200 && status < 400,
        status,
      };
    }),
    getUrl: vi.fn(async () => currentUrl),
    extractHtml: vi.fn(async () => ({
      value: htmlByUrl.get(currentUrl) ?? `<html data-url="${currentUrl}"></html>`,
    })),
    screenshot: vi.fn().mockResolvedValue({
      data: Buffer.from("fake-image"),
      contentType: "image/jpeg",
    }),
    evaluate: vi.fn().mockResolvedValue({ value: links }),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const sortSnapshots = () =>
    [...snapshots.values()].sort((left, right) => {
      const priorityDelta = (left.pagePriority ?? 999) - (right.pagePriority ?? 999);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return String(left.url).localeCompare(String(right.url));
    });

  const deps = {
    auditJobs: {
      getAuditRunProgress: vi.fn(async (auditRunId: string) => ({
        auditRun: {
          id: auditRunId,
          projectId: null,
          targetDomainId: "target-1",
          status: runStatus,
          homepageOnly,
          startedAt: new Date("2026-04-23T10:00:00.000Z"),
          completedAt: runStatus === "complete" || runStatus === "failed" ? new Date() : null,
          failureReason,
          createdAt: new Date("2026-04-23T10:00:00.000Z"),
        },
        pageSnapshots: sortSnapshots(),
      })),
      updateAuditRunStatus: vi.fn(async (input: any) => {
        runStatus = input.status;
        if (typeof input.homepageOnly === "boolean") {
          homepageOnly = input.homepageOnly;
        }
        failureReason = input.status === "failed" ? (input.failureReason ?? failureReason) : null;
      }),
      insertPageSnapshot: vi.fn().mockImplementation(async (input: any) => {
        const existing = sortSnapshots().find((snapshot) => snapshot.url === input.url);
        if (existing) {
          existing.pageType = input.pageType;
          existing.pagePriority = input.pagePriority;
          return { ...existing };
        }

        const snapshot = {
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
        };

        snapshots.set(snapshot.id, snapshot);
        return { ...snapshot };
      }),
      updatePageSnapshotState: vi.fn().mockImplementation(async (input: any) => {
        const existing = snapshots.get(input.pageSnapshotId);
        const updated = {
          ...existing,
          id: input.pageSnapshotId,
          auditRunId: existing?.auditRunId ?? "run",
          url: existing?.url ?? currentUrl,
          pageType: existing?.pageType ?? "homepage",
          pagePriority: existing?.pagePriority ?? 0,
          pageState: input.pageState,
          retryCount: input.retryCount ?? existing?.retryCount ?? 0,
          lastError: input.lastError,
          capturedAt: existing?.capturedAt ?? null,
          htmlStorageKey: existing?.htmlStorageKey,
          screenshotStorageKey: existing?.screenshotStorageKey,
        };

        snapshots.set(input.pageSnapshotId, updated);
        return { ...updated };
      }),
      completePageSnapshotCapture: vi.fn().mockImplementation(async (input: any) => {
        const existing = snapshots.get(input.pageSnapshotId);
        const updated = {
          ...existing,
          id: input.pageSnapshotId,
          auditRunId: existing?.auditRunId ?? "run",
          url: input.url,
          pageType: existing?.pageType ?? "homepage",
          pagePriority: existing?.pagePriority ?? 0,
          pageState: "captured",
          retryCount: input.retryCount ?? existing?.retryCount ?? 0,
          lastError: null,
          htmlStorageKey: input.htmlStorageKey,
          screenshotStorageKey: input.screenshotStorageKey,
          capturedAt: new Date(),
        };

        snapshots.set(input.pageSnapshotId, updated);
        return { ...updated };
      }),
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
      homepageOnly: true,
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
      url: "https://example.com/",
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
        pageType: "content",
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

  it("resumes pending captures from persisted page state without rediscovery", async () => {
    const { deps, session } = createDeps({
      initialStatus: "capturing",
      existingSnapshots: [
        {
          id: "snapshot-1",
          auditRunId: "run-resume",
          url: "https://example.com/",
          pageType: "homepage",
          pagePriority: 0,
          pageState: "accepted",
          retryCount: 0,
          lastError: null,
          htmlStorageKey: "audit-runs/run-resume/homepage/root.html",
          screenshotStorageKey: "audit-runs/run-resume/homepage/root.jpg",
          capturedAt: new Date("2026-04-23T10:01:00.000Z"),
        },
        {
          id: "snapshot-2",
          auditRunId: "run-resume",
          url: "https://example.com/contact",
          pageType: "contact",
          pagePriority: 50,
          pageState: "queued",
          retryCount: 1,
          lastError: "Timed out",
          htmlStorageKey: null,
          screenshotStorageKey: null,
          capturedAt: null,
        },
      ],
    });

    const result = await captureAuditRun(
      {
        auditRunId: "run-resume",
        domain: "example.com",
      },
      deps
    );

    expect(result).toEqual({
      auditRunId: "run-resume",
      pagesProcessed: 2,
      homepageOnly: false,
    });
    expect(session.evaluate).not.toHaveBeenCalled();
    expect(deps.auditJobs.insertPageSnapshot).not.toHaveBeenCalled();
    expect(deps.auditJobs.completePageSnapshotCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        pageSnapshotId: "snapshot-2",
        retryCount: 1,
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
      failureKind: "unknown",
      failureStage: "discover",
      failureDetails: {
        driver: "playwright",
        marker: "unknown",
        message: "Failed to load homepage. Status: 500",
        retryable: true,
        source: "unknown",
        statusCode: undefined,
        url: "https://example.com",
      },
      homepageOnly: true,
    });
  });

  it("classifies 403 homepage responses as target access denial during discovery", async () => {
    const { deps } = createDeps({
      statusByUrl: {
        "https://example.com": 403,
      },
    });

    const result = await captureAuditRun(
      {
        auditRunId: "run-403",
        domain: "example.com",
      },
      deps
    );

    expect(result.errorMessage).toMatch(/target denied this audit request/i);
    expect(deps.auditJobs.updateAuditRunStatus).toHaveBeenLastCalledWith({
      auditRunId: "run-403",
      status: "failed",
      failureReason: "The target denied this audit request. That does not prove the site is broken for regular visitors.",
      failureKind: "access_denied",
      failureStage: "discover",
      failureDetails: {
        driver: "playwright",
        marker: "http_403",
        message: undefined,
        retryable: false,
        source: "target",
        statusCode: 403,
        url: "https://example.com",
      },
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
      failureKind: "runtime_error",
      failureStage: "discover",
      failureDetails: {
        driver: "playwright",
        marker: "browser_launch",
        message: expect.stringContaining("Playwright Chromium is unavailable in this deployment"),
        retryable: true,
        source: "runtime",
        statusCode: undefined,
        url: "https://example.com",
      },
      homepageOnly: true,
    });
  });
});
