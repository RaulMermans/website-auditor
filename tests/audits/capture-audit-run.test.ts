import { afterEach, describe, expect, it, vi } from "vitest";
import { captureAuditRun } from "@/server/audits/capture-audit-run";
import { normalizePlaywrightChromiumLaunchError } from "@/server/browser/playwright-chromium-driver";

afterEach(() => {
  vi.restoreAllMocks();
});

function createDeps(options?: {
  links?: Array<{ href: string; origin: string; pathname: string; text: string }>;
  failingUrls?: Set<string>;
  homepageOk?: boolean;
}) {
  const links = options?.links ?? [];
  const failingUrls = options?.failingUrls ?? new Set<string>();
  let currentUrl = "about:blank";

  const session = {
    navigate: vi.fn(async ({ url }: { url: string }) => {
      currentUrl = url;

      if (failingUrls.has(url)) {
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
      insertPageSnapshot: vi.fn().mockResolvedValue(undefined),
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
      url: "https://example.com",
      pageType: "homepage",
      htmlStorageKey: "audit-runs/run-123/homepage/root.html",
      screenshotStorageKey: "audit-runs/run-123/homepage/root.jpg",
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
      failingUrls: new Set(["https://example.com/services"]),
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
    expect(deps.auditJobs.insertPageSnapshot).toHaveBeenCalledTimes(4);
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
        pageType: "other",
        url: "https://example.com/team",
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
