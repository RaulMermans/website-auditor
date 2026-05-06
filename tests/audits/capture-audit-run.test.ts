import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({
  withDbClient: vi.fn(),
  withTransaction: vi.fn(),
}));

import { captureAuditRun } from "@/server/audits/capture-audit-run";
import { AuditFailureError } from "@/lib/audit-failure";
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
  fetchStaticStatusByUrl?: Record<string, number>;
  initialStatus?: import("@/lib/types").AuditStatus;
  existingSnapshots?: Array<Record<string, unknown>>;
}) {
  const links = options?.links ?? [];
  const failingUrls = new Map(Object.entries(options?.failingUrls ?? {}));
  const statusByUrl = new Map(Object.entries(options?.statusByUrl ?? {}));
  const htmlByUrl = new Map(Object.entries(options?.htmlByUrl ?? {}));
  const fetchStaticStatusByUrl = new Map(Object.entries(options?.fetchStaticStatusByUrl ?? {}));
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
      value:
        htmlByUrl.get(currentUrl) ??
        htmlByUrl.get(currentUrl.replace(/\/$/, "")) ??
        `<html data-url="${currentUrl}"></html>`,
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
          captureMethod: input.captureMethod,
          capturedAt: new Date(),
        };

        snapshots.set(input.pageSnapshotId, updated);
        return { ...updated };
      }),
      insertAuditRunAttempt: vi.fn().mockResolvedValue(undefined),
    },
    storage: {
      put: vi.fn().mockImplementation(async (key: string) => key),
    },
    browser: {
      name: "playwright" as const,
      createSession: vi.fn().mockResolvedValue(session),
    },
    waitAfterNavigation: vi.fn().mockResolvedValue(undefined),
    // Default static fetcher: returns OK HTML for any URL, respects htmlByUrl and fetchStaticStatusByUrl.
    fetchStatic: vi.fn().mockImplementation(async (url: string) => {
      const status = fetchStaticStatusByUrl.get(url) ?? 200;
      return {
        html: htmlByUrl.get(url) ?? `<html data-url="${url}"></html>`,
        statusCode: status,
        ok: status >= 200 && status < 400,
        finalUrl: url,
      };
    }),
  };

  return { deps, session };
}

const USABLE_THIN_HTML = [
  "<html><head><title>Example Consulting</title></head><body>",
  "<main><h1>Practical website audits for growing teams</h1>",
  "<p>We help local teams clarify their offer, improve trust, and make the next step easier for visitors.</p>",
  "<button>Contact us</button><p>Services, pricing, and booking details are available on request.</p>",
  "</main><footer>Contact hello@example.com Privacy Terms</footer></body></html>",
].join("");

describe("captureAuditRun", () => {
  // ─── Core homepage capture ────────────────────────────────────────────────

  it("captures the homepage via browser and updates run state", async () => {
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
      limitationNote: null,
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
      captureMethod: "browser",
      retryCount: 0,
    });
  });

  // ─── Scenario A: secondary pages use static (primary path) ───────────────

  it("captures secondary pages via static HTTP fetch by default", async () => {
    // Static-first discovery: links come from HTML, not session.evaluate.
    const { deps } = createDeps({
      htmlByUrl: {
        "https://example.com": [
          '<html><body>',
          '<a href="https://example.com/about">About</a>',
          '<a href="https://example.com/contact">Contact</a>',
          '</body></html>',
        ].join(""),
      },
    });

    const result = await captureAuditRun(
      { auditRunId: "run-static", domain: "example.com" },
      deps
    );

    expect(result.pagesProcessed).toBe(3);
    expect(result.homepageOnly).toBe(false);
    expect(result.limitationNote).toBeNull();

    // Static discovery fetches homepage; secondary pages are also fetched statically.
    expect(deps.fetchStatic).toHaveBeenCalledWith("https://example.com");
    expect(deps.fetchStatic).toHaveBeenCalledWith("https://example.com/about");
    expect(deps.fetchStatic).toHaveBeenCalledWith("https://example.com/contact");
    // Browser session created only for homepage screenshot (capture phase)
    expect(deps.browser.createSession).toHaveBeenCalledTimes(1);

    // Secondary pages completed with static capture method, no screenshot
    const calls = (deps.auditJobs.completePageSnapshotCapture as any).mock.calls;
    const aboutCall = calls.find((c: any) => c[0].url === "https://example.com/about");
    expect(aboutCall[0].captureMethod).toBe("static");
    expect(aboutCall[0].screenshotStorageKey).toBeNull();

    // Homepage completed with browser capture method + screenshot
    const homepageCall = calls.find((c: any) => c[0].url === "https://example.com/");
    expect(homepageCall[0].captureMethod).toBe("browser");
    expect(homepageCall[0].screenshotStorageKey).toBeTruthy();
  });

  it("discovers priority pages and skips a failing secondary static capture", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { deps } = createDeps({
      htmlByUrl: {
        "https://example.com": [
          '<html><body>',
          '<a href="https://example.com/about">About</a>',
          '<a href="https://example.com/services">Services</a>',
          '<a href="https://example.com/contact">Contact</a>',
          '<a href="https://example.com/blog">Blog</a>',
          '</body></html>',
        ].join(""),
      },
      // services returns 500 from static fetch
      fetchStaticStatusByUrl: { "https://example.com/services": 500 },
    });

    const result = await captureAuditRun(
      {
        auditRunId: "run-456",
        domain: "example.com",
      },
      deps
    );

    expect(result.auditRunId).toBe("run-456");
    expect(result.pagesProcessed).toBe(4); // homepage + about + contact + blog
    expect(result.homepageOnly).toBe(false);
    expect(deps.auditJobs.insertPageSnapshot).toHaveBeenCalledTimes(5);
    expect(deps.auditJobs.updatePageSnapshotState).toHaveBeenCalledWith(
      expect.objectContaining({
        pageState: "needs_review",
        lastError: expect.stringContaining("Static fetch failed"),
      })
    );
  });

  it("fills remaining capture slots with other internal pages via static", async () => {
    const { deps } = createDeps({
      htmlByUrl: {
        "https://example.com": '<html><body><a href="https://example.com/team">Team</a></body></html>',
      },
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
    // Team/about page captured via static
    expect(deps.fetchStatic).toHaveBeenCalledWith("https://example.com/team");
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
          retryCount: 0,
          lastError: null,
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
      limitationNote: null,
    });
    // No rediscovery
    expect(session.evaluate).not.toHaveBeenCalled();
    expect(deps.auditJobs.insertPageSnapshot).not.toHaveBeenCalled();
    // Contact page captured via static (secondary page policy)
    expect(deps.fetchStatic).toHaveBeenCalledWith("https://example.com/contact");
    expect(deps.auditJobs.completePageSnapshotCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        pageSnapshotId: "snapshot-2",
        captureMethod: "static",
      })
    );
  });

  // ─── Scenario B: browser still used for homepage ──────────────────────────

  it("falls back to static when browser returns a 5xx error response for the homepage", async () => {
    // Static discovery succeeds (default fetchStatic returns 200 with thin HTML).
    // Browser capture of homepage returns 500. With static-first policy the run should
    // NOT hard-fail — it degrades to the already-available static HTML.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { deps } = createDeps({
      homepageOk: false,
      htmlByUrl: {
        "https://example.com": USABLE_THIN_HTML,
        "https://example.com/": USABLE_THIN_HTML,
      },
    });

    const result = await captureAuditRun(
      { auditRunId: "run-999", domain: "example.com" },
      deps
    );

    // Run succeeds via static fallback — a browser 500 is not a terminal failure.
    expect(result.auditRunId).toBe("run-999");
    expect(result.pagesProcessed).toBe(1);
    expect(result.homepageOnly).toBe(true);
    expect(result.errorMessage).toBeUndefined();
    // Limitation note reflects a browser runtime failure, not a bot challenge.
    expect(result.limitationNote).toMatch(/runtime error/i);

    // Homepage captured via fallback_static — no screenshot
    const calls = (deps.auditJobs.completePageSnapshotCapture as any).mock.calls;
    const homepageCall = calls.find((c: any) => c[0].url?.endsWith("/"));
    expect(homepageCall[0].captureMethod).toBe("fallback_static");
    expect(homepageCall[0].screenshotStorageKey).toBeNull();

    // Run never marked as failed
    expect(deps.auditJobs.updateAuditRunStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" })
    );
  });

  it("classifies 403 from static discovery as target access denial at discover stage", async () => {
    // With static-first discovery, the 403 is detected from the static fetch, not the browser.
    const { deps } = createDeps({
      fetchStaticStatusByUrl: { "https://example.com": 403 },
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
        driver: "static",
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

  // ─── Scenario C: browser unavailable → static fallback (graceful degrade) ─

  it("degrades to static capture when Chromium is unavailable at runtime", async () => {
    const { deps } = createDeps({
      htmlByUrl: {
        "https://example.com": USABLE_THIN_HTML,
        "https://example.com/": USABLE_THIN_HTML,
      },
    });
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

    // Run SUCCEEDS via static discovery + static capture
    expect(result.auditRunId).toBe("run-browser-missing");
    expect(result.errorMessage).toBeUndefined();
    expect(result.pagesProcessed).toBe(1); // homepage captured statically
    expect(result.homepageOnly).toBe(true);
    expect(result.limitationNote).toMatch(/browser.*unavailable/i);
    // Static fetcher was used for homepage
    expect(deps.fetchStatic).toHaveBeenCalledWith("https://example.com");
    // No failure status update
    expect(deps.auditJobs.updateAuditRunStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" })
    );
  });

  // ─── Scenario D: bot challenge during static discovery ───────────────────

  it("hard-fails when static discovery hits a bot challenge with no public evidence", async () => {
    // Static discovery fetches "https://example.com" and gets a challenge page.
    // The run must not try browser as a workaround for the challenge.
    const { deps } = createDeps({
      htmlByUrl: {
        "https://example.com": "<html><head><title>Just a moment…</title></head><body>Cloudflare security check captcha verify you are human</body></html>",
      },
    });

    const result = await captureAuditRun(
      { auditRunId: "run-challenge", domain: "example.com" },
      deps
    );

    expect(result.auditRunId).toBe("run-challenge");
    expect(result.errorMessage).toMatch(/security or bot-challenge page/i);
    expect(result.pagesProcessed).toBe(0);
    expect(result.homepageOnly).toBe(true);
    expect(deps.browser.createSession).not.toHaveBeenCalled();
    expect(deps.auditJobs.insertPageSnapshot).not.toHaveBeenCalled();
  });

  it("degrades browser and falls back to static when browser capture hits a bot challenge", async () => {
    // Static discovery succeeds. Browser capture of homepage gets a JS-rendered challenge
    // (common with Cloudflare IUAM). Static fetch of the same URL returns real HTML.
    const { deps, session } = createDeps({
      htmlByUrl: {
        // Browser navigates to "https://example.com/" and sees the challenge via extractHtml.
        "https://example.com/": "<html><body>captcha verify you are human</body></html>",
      },
    });
    // Override static fetcher to always return usable public HTML — simulates JS-only challenge.
    deps.fetchStatic = vi.fn().mockImplementation(async (url: string) => ({
      html: USABLE_THIN_HTML,
      statusCode: 200,
      ok: true,
      finalUrl: url,
    }));

    const result = await captureAuditRun(
      { auditRunId: "run-browser-challenge", domain: "example.com" },
      deps
    );

    expect(result.auditRunId).toBe("run-browser-challenge");
    expect(result.limitationNote).toMatch(/blocked or degraded by a security challenge/i);
    expect(result.pagesProcessed).toBe(1);
    expect(result.homepageOnly).toBe(true);
    // Static fallback used for the homepage after browser was degraded
    expect(deps.fetchStatic).toHaveBeenCalledWith("https://example.com/");
    const calls = (deps.auditJobs.completePageSnapshotCapture as any).mock.calls;
    const homepageCall = calls.find((c: any) =>
      c[0].url?.endsWith("/") || c[0].url === "https://example.com/"
    );
    expect(homepageCall).toBeDefined();
    expect(homepageCall[0].captureMethod).toBe("fallback_static");
    expect(session.navigate).toHaveBeenCalledTimes(1);
  });

  // ─── Scenario E: capture provenance is explicit ───────────────────────────

  it("records browser capture provenance for homepage and static for secondary pages", async () => {
    const { deps } = createDeps({
      htmlByUrl: {
        "https://example.com": '<html><body><a href="https://example.com/about">About</a></body></html>',
      },
    });

    await captureAuditRun(
      { auditRunId: "run-provenance", domain: "example.com" },
      deps
    );

    const calls = (deps.auditJobs.completePageSnapshotCapture as any).mock.calls;
    const homepageCall = calls.find((c: any) => c[0].url?.includes("example.com/"));
    const aboutCall = calls.find((c: any) => c[0].url === "https://example.com/about");

    expect(homepageCall[0].captureMethod).toBe("browser");
    expect(aboutCall[0].captureMethod).toBe("static");
  });

  it("records fallback_static provenance when browser challenge hits during homepage capture", async () => {
    // Static discovery succeeds. Browser challenge during capture → degrade → static fallback.
    const { deps } = createDeps({
      htmlByUrl: {
        "https://example.com/": "<html><body>captcha verify you are human</body></html>",
      },
    });
    // Static fetch returns usable public HTML (JS-only challenge).
    deps.fetchStatic = vi.fn().mockImplementation(async (url: string) => ({
      html: USABLE_THIN_HTML,
      statusCode: 200,
      ok: true,
      finalUrl: url,
    }));

    const result = await captureAuditRun(
      { auditRunId: "run-fallback-prov", domain: "example.com" },
      deps
    );

    expect(result.limitationNote).toMatch(/blocked or degraded by a security challenge/i);
    expect(result.pagesProcessed).toBe(1);
    const calls = (deps.auditJobs.completePageSnapshotCapture as any).mock.calls;
    const homepageCall = calls.find((c: any) =>
      c[0].url?.endsWith("/") || c[0].url === "https://example.com/"
    );
    expect(homepageCall).toBeDefined();
    expect(homepageCall[0].captureMethod).toBe("fallback_static");
  });

  // ─── Auth-wall is NOT classified as bot challenge ─────────────────────────

  it("classifies 401 as auth_wall and hard-fails the run (not as a bot challenge)", async () => {
    // With static-first discovery, the 401 is detected from the static fetch.
    const { deps } = createDeps({
      fetchStaticStatusByUrl: { "https://example.com": 401 },
    });

    const result = await captureAuditRun(
      { auditRunId: "run-auth", domain: "example.com" },
      deps
    );

    expect(result.errorMessage).toMatch(/signed-in or authenticated/i);
    expect(deps.auditJobs.updateAuditRunStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "failed",
        failureKind: "auth_wall",
      })
    );
    expect(result.limitationNote).toBeFalsy();
  });

  // ─── Screenshot timeout distinct from challenge ───────────────────────────

  it("falls back to static (not hard-fail) when browser screenshot times out", async () => {
    // Static discovery and capture fetch both succeed with thin HTML.
    // Browser navigation and HTML extraction succeed, but the screenshot times out.
    // Key: this must NOT be classified as capture_blocked and must NOT kill the run.
    const { deps } = createDeps({
      htmlByUrl: {
        "https://example.com": USABLE_THIN_HTML,
        "https://example.com/": USABLE_THIN_HTML,
      },
    });

    const originalCreateSession = deps.browser.createSession;
    deps.browser.createSession = vi.fn().mockImplementation(async () => {
      const session = await (originalCreateSession as any)();
      session.screenshot = vi.fn().mockImplementation(async () => {
        throw new Error("screenshot timed out after 90000ms");
      });
      return session;
    });

    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await captureAuditRun(
      { auditRunId: "run-timeout", domain: "example.com" },
      deps
    );

    // Run succeeds via static fallback — screenshot timeout is a runtime error, not a bot challenge.
    expect(result.pagesProcessed).toBe(1);
    expect(result.errorMessage).toBeUndefined();
    expect(result.limitationNote).not.toMatch(/bot.challenge|security check|captcha/i);
    expect(result.limitationNote).toBeDefined();

    // Homepage captured via fallback_static (browser screenshot failed)
    const calls = (deps.auditJobs.completePageSnapshotCapture as any).mock.calls;
    const homepageCall = calls.find((c: any) => c[0].url?.endsWith("/"));
    expect(homepageCall[0].captureMethod).toBe("fallback_static");
    expect(homepageCall[0].screenshotStorageKey).toBeNull();
  });

  // ─── Scenario F: static-first secondary pages don't need browser session ──

  it("does not require browser session when all discovered pages are secondary (static)", async () => {
    // Run that resumes with only secondary pages queued — browser should not be started
    const { deps } = createDeps({
      initialStatus: "capturing",
      existingSnapshots: [
        {
          id: "snapshot-1",
          auditRunId: "run-static-only",
          url: "https://example.com/",
          pageType: "homepage",
          pagePriority: 0,
          pageState: "accepted",
          retryCount: 0,
          lastError: null,
          htmlStorageKey: "audit-runs/run-static-only/homepage/root.html",
          screenshotStorageKey: "audit-runs/run-static-only/homepage/root.jpg",
          capturedAt: new Date(),
        },
        {
          id: "snapshot-2",
          auditRunId: "run-static-only",
          url: "https://example.com/about",
          pageType: "about",
          pagePriority: 40,
          pageState: "queued",
          retryCount: 0,
          lastError: null,
          htmlStorageKey: null,
          screenshotStorageKey: null,
          capturedAt: null,
        },
      ],
    });

    await captureAuditRun(
      { auditRunId: "run-static-only", domain: "example.com" },
      deps
    );

    // Browser session never created — only secondary page needed, planner picks static
    expect(deps.browser.createSession).not.toHaveBeenCalled();
    expect(deps.fetchStatic).toHaveBeenCalledWith("https://example.com/about");
  });

  // ─── Static-first policy: sufficient HTML bypasses browser entirely ─────────

  it("completes with static capture when homepage HTML has sufficient content (no browser needed)", async () => {
    const richHtml = [
      "<html><head><title>Grow Your Business</title></head><body>",
      "<h1>Predictable Lead Generation for Agencies</h1>",
      "<p>We help agencies and consultants turn their website into a predictable lead generation machine. ",
      "Our proven methodology identifies exactly what is holding your site back from converting visitors ",
      "into qualified prospects. Stop guessing and start growing with evidence-backed recommendations.</p>",
      "<ul><li>More qualified leads</li><li>Higher conversion rates</li><li>Clear positioning</li></ul>",
      "<p>Book a free strategy call today and see how we can help you scale your business faster. ",
      "Over 200 agencies have improved their close rates using our framework. ",
      "Schedule your audit now and get a full breakdown within 48 hours.</p>",
      "</body></html>",
    ].join("");

    const { deps } = createDeps();
    // Return rich HTML for any URL — both discovery and capture fetches.
    deps.fetchStatic = vi.fn().mockImplementation(async (url: string) => ({
      html: richHtml,
      statusCode: 200,
      ok: true,
      finalUrl: url,
    }));

    const result = await captureAuditRun({ auditRunId: "run-rich", domain: "example.com" }, deps);

    expect(result.pagesProcessed).toBe(1);
    expect(result.errorMessage).toBeUndefined();
    expect(result.limitationNote).toBeNull();

    // Browser session never created — static HTML is sufficient
    expect(deps.browser.createSession).not.toHaveBeenCalled();

    // Homepage captured via plain static (not fallback_static, not browser)
    const calls = (deps.auditJobs.completePageSnapshotCapture as any).mock.calls;
    const homepageCall = calls.find((c: any) => c[0].url?.endsWith("/"));
    expect(homepageCall[0].captureMethod).toBe("static");
    expect(homepageCall[0].screenshotStorageKey).toBeNull();
  });

  it("escalates to browser when homepage HTML is a JS shell (thin/rendered content)", async () => {
    // Default fetchStatic HTML is <html data-url="..."></html> — thin JS shell.
    // Browser should be tried as an upgrade.
    const { deps } = createDeps();

    const result = await captureAuditRun({ auditRunId: "run-shell", domain: "example.com" }, deps);

    expect(result.pagesProcessed).toBe(1);
    expect(result.errorMessage).toBeUndefined();

    // Browser was used for the homepage (thin HTML triggers escalation)
    expect(deps.browser.createSession).toHaveBeenCalledTimes(1);
    const calls = (deps.auditJobs.completePageSnapshotCapture as any).mock.calls;
    const homepageCall = calls.find((c: any) => c[0].captureMethod);
    expect(homepageCall[0].captureMethod).toBe("browser");
  });

  it("falls back to static with runtime-failure note when browser fails with a non-challenge error", async () => {
    // Static fetch succeeds (thin HTML), browser navigation returns 500 (non-challenge).
    // The run should complete — a browser error must not kill an otherwise-auditable page.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { deps } = createDeps({
      homepageOk: false,
      htmlByUrl: {
        "https://example.com": USABLE_THIN_HTML,
        "https://example.com/": USABLE_THIN_HTML,
      },
    });

    const result = await captureAuditRun({ auditRunId: "run-nonchal", domain: "example.com" }, deps);

    expect(result.pagesProcessed).toBe(1);
    expect(result.errorMessage).toBeUndefined();
    expect(result.limitationNote).toMatch(/runtime error/i);

    const calls = (deps.auditJobs.completePageSnapshotCapture as any).mock.calls;
    const homepageCall = calls.find((c: any) => c[0].url?.endsWith("/"));
    expect(homepageCall[0].captureMethod).toBe("fallback_static");
    expect(homepageCall[0].screenshotStorageKey).toBeNull();
  });

  it("hard-fails only when both static and browser are blocked (no public evidence)", async () => {
    // Both static and browser return a bot-challenge page.
    // No usable HTML evidence: run must hard-fail.
    const challengeHtml = "<html><body>captcha verify you are human cloudflare</body></html>";

    const { deps } = createDeps();
    // Static fetcher always returns the challenge, for every URL.
    deps.fetchStatic = vi.fn().mockImplementation(async (url: string) => ({
      html: challengeHtml,
      statusCode: 200,
      ok: true,
      finalUrl: url,
    }));
    // Browser also gets the challenge via extractHtml.
    const { session } = createDeps({
      htmlByUrl: { "https://example.com/": challengeHtml },
    });
    deps.browser.createSession = vi.fn().mockResolvedValue(session);

    const result = await captureAuditRun({ auditRunId: "run-both-blocked", domain: "example.com" }, deps);

    // Hard fail: no usable evidence from any path
    expect(result.pagesProcessed).toBe(0);
    expect(result.errorMessage).toBeDefined();
    expect(deps.auditJobs.updateAuditRunStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "failed" })
    );
  });

  it("browser degradation from homepage disables browser for all remaining pages in the run", async () => {
    // Static-preferred for homepage: thin HTML → browser tried → bot challenge → degrade.
    // Remaining secondary pages must use static, not attempt browser.
    const { deps } = createDeps({
      htmlByUrl: {
        // Browser sees challenge when navigating homepage
        "https://example.com/": "<html><body>captcha verify you are human</body></html>",
      },
    });
    // Static fetcher: discovery URL returns HTML with an about link; all other URLs return thin HTML.
    deps.fetchStatic = vi.fn().mockImplementation(async (url: string) => ({
      html: url === "https://example.com"
        ? '<html><body><a href="https://example.com/about">About</a></body></html>'
        : USABLE_THIN_HTML,
      statusCode: 200,
      ok: true,
      finalUrl: url,
    }));

    const result = await captureAuditRun({ auditRunId: "run-degrade", domain: "example.com" }, deps);

    expect(result.pagesProcessed).toBe(2); // homepage (fallback_static) + about (static)
    expect(result.limitationNote).toMatch(/security challenge/i);

    // Browser was created exactly once (for homepage attempt), then degraded
    expect(deps.browser.createSession).toHaveBeenCalledTimes(1);

    const calls = (deps.auditJobs.completePageSnapshotCapture as any).mock.calls;
    const homepageCall = calls.find((c: any) => c[0].url?.endsWith("/"));
    expect(homepageCall[0].captureMethod).toBe("fallback_static");

    // About page uses fallback_static (not plain static) because browser is degraded for the run
    const aboutCall = calls.find((c: any) => c[0].url === "https://example.com/about");
    expect(aboutCall[0].captureMethod).toBe("fallback_static");
    expect(aboutCall[0].screenshotStorageKey).toBeNull();
  });

  // ─── Limitation reporting reflects degraded capture ───────────────────────

  it("limitation note distinguishes browser-unavailable from challenge-blocked", async () => {
    // Browser unavailable
    const { deps: depsUnavailable } = createDeps({
      htmlByUrl: {
        "https://example.com": USABLE_THIN_HTML,
        "https://example.com/": USABLE_THIN_HTML,
      },
    });
    depsUnavailable.browser.createSession = vi.fn().mockRejectedValue(
      normalizePlaywrightChromiumLaunchError(
        new Error("browserType.launch: Executable doesn't exist")
      )
    );
    const resultUnavailable = await captureAuditRun(
      { auditRunId: "run-unavail", domain: "example.com" },
      depsUnavailable
    );
    expect(resultUnavailable.limitationNote).toMatch(/unavailable/i);
    expect(resultUnavailable.limitationNote).not.toMatch(/security challenge/i);

    // Static discovery gets a bot-challenge page → hard failure, no limitation report.
    const { deps: depsBlocked } = createDeps({
      htmlByUrl: {
        // Static fetcher is called with the bare baseUrl (no trailing slash).
        "https://example.com": "<html><body>captcha verify you are human</body></html>",
      },
    });
    const resultBlocked = await captureAuditRun(
      { auditRunId: "run-blocked", domain: "example.com" },
      depsBlocked
    );
    expect(resultBlocked.errorMessage).toMatch(/security or bot-challenge page/i);
    expect(resultBlocked.limitationNote).toBeNull();
  });

  // ─── Secondary static sweep: homepage bot-blocked ─────────────────────────

  it("runs secondary static sweep when homepage is bot-blocked at discovery and secondary pages are accessible", async () => {
    // Homepage returns a bot-challenge page (200 OK but challenge HTML).
    // Secondary routes /about and /contact return usable public HTML.
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const challengeHtml =
      "<html><head><title>Just a moment…</title></head><body>Cloudflare security check captcha verify you are human</body></html>";
    const secondaryHtml = USABLE_THIN_HTML;

    const { deps } = createDeps();
    deps.fetchStatic = vi.fn().mockImplementation(async (url: string) => {
      if (url === "https://example.com") {
        return { html: challengeHtml, statusCode: 200, ok: true, finalUrl: url };
      }
      // Secondary routes return usable HTML
      return { html: secondaryHtml, statusCode: 200, ok: true, finalUrl: url };
    });

    const result = await captureAuditRun(
      { auditRunId: "run-secondary-sweep", domain: "example.com" },
      deps
    );

    // Must NOT hard-fail
    expect(result.errorMessage).toBeUndefined();
    // Must carry the homepage-blocked limitation note
    expect(result.limitationNote).toMatch(/homepage capture was blocked/i);
    // Must have captured at least one secondary page
    expect(result.pagesProcessed).toBeGreaterThanOrEqual(1);
    // homepageOnly is false because secondary pages were captured
    expect(result.homepageOnly).toBe(false);
    // Browser must never have been opened
    expect(deps.browser.createSession).not.toHaveBeenCalled();
    // No homepage snapshot inserted (secondary sweep skips homepage entirely)
    const calls = (deps.auditJobs.insertPageSnapshot as any).mock.calls;
    const homepageInsert = calls.find((c: any) => c[0].pageType === "homepage");
    expect(homepageInsert).toBeUndefined();
  });

  it("hard-fails when homepage is bot-blocked and secondary sweep finds no accessible public pages", async () => {
    // Homepage and ALL secondary routes return the challenge page.
    const challengeHtml =
      "<html><body>Cloudflare security check captcha verify you are human</body></html>";

    const { deps } = createDeps();
    deps.fetchStatic = vi.fn().mockImplementation(async (url: string) => ({
      html: challengeHtml,
      statusCode: 200,
      ok: true,
      finalUrl: url,
    }));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await captureAuditRun(
      { auditRunId: "run-all-blocked", domain: "example.com" },
      deps
    );

    // Must hard-fail: no trustworthy evidence from any path
    expect(result.errorMessage).toMatch(/security or bot-challenge page/i);
    expect(result.pagesProcessed).toBe(0);
    expect(deps.auditJobs.updateAuditRunStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "failed" })
    );
  });

  it("secondary sweep respects page cap and remains same-origin only", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const challengeHtml =
      "<html><body>captcha verify you are human cloudflare</body></html>";
    const secondaryHtml = USABLE_THIN_HTML;
    let fetchCount = 0;

    const { deps } = createDeps();
    deps.fetchStatic = vi.fn().mockImplementation(async (url: string) => {
      if (url === "https://example.com") {
        return { html: challengeHtml, statusCode: 200, ok: true, finalUrl: url };
      }
      fetchCount++;
      return { html: secondaryHtml, statusCode: 200, ok: true, finalUrl: url };
    });

    await captureAuditRun(
      { auditRunId: "run-cap", domain: "example.com", maxPages: 3 },
      deps
    );

    // maxPages=3 → cap is maxPages-1=2 secondary pages
    const insertCalls = (deps.auditJobs.insertPageSnapshot as any).mock.calls;
    // At most 2 secondary snapshots queued (maxPages - 1)
    expect(insertCalls.length).toBeLessThanOrEqual(2);
    // All fetched URLs must be same-origin
    const allFetchedUrls: string[] = (deps.fetchStatic as any).mock.calls.map((c: any[]) => c[0]);
    for (const url of allFetchedUrls) {
      expect(url.startsWith("https://example.com")).toBe(true);
    }
  });

  it("secondary sweep skips 404 and non-200 responses from secondary routes", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const challengeHtml =
      "<html><body>captcha verify you are human cloudflare</body></html>";
    const secondaryHtml = USABLE_THIN_HTML;

    const { deps } = createDeps();
    deps.fetchStatic = vi.fn().mockImplementation(async (url: string) => {
      if (url === "https://example.com") {
        return { html: challengeHtml, statusCode: 200, ok: true, finalUrl: url };
      }
      // Simulate most routes 404'ing, only /contact succeeds
      if (url.includes("/contact")) {
        return { html: secondaryHtml, statusCode: 200, ok: true, finalUrl: url };
      }
      return { html: "<html><body>Not Found</body></html>", statusCode: 404, ok: false, finalUrl: url };
    });

    const result = await captureAuditRun(
      { auditRunId: "run-partial-routes", domain: "example.com" },
      deps
    );

    // Should still succeed with just the contact page
    expect(result.errorMessage).toBeUndefined();
    expect(result.pagesProcessed).toBeGreaterThanOrEqual(1);
    expect(result.limitationNote).toMatch(/homepage capture was blocked/i);
  });

  it("secondary sweep does not insert homepage as a secondary page", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const challengeHtml =
      "<html><body>captcha verify you are human cloudflare</body></html>";

    const { deps } = createDeps();
    deps.fetchStatic = vi.fn().mockImplementation(async (url: string) => {
      if (url === "https://example.com") {
        return { html: challengeHtml, statusCode: 200, ok: true, finalUrl: url };
      }
      return { html: USABLE_THIN_HTML, statusCode: 200, ok: true, finalUrl: url };
    });

    await captureAuditRun(
      { auditRunId: "run-no-homepage-secondary", domain: "example.com" },
      deps
    );

    const insertCalls = (deps.auditJobs.insertPageSnapshot as any).mock.calls;
    for (const call of insertCalls) {
      expect(call[0].pageType).not.toBe("homepage");
    }
  });

  it("limitation note appears in secondary-sweep partial audit result", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const challengeHtml =
      "<html><body>captcha verify you are human cloudflare</body></html>";

    const { deps } = createDeps();
    deps.fetchStatic = vi.fn().mockImplementation(async (url: string) => {
      if (url === "https://example.com") {
        return { html: challengeHtml, statusCode: 200, ok: true, finalUrl: url };
      }
      return { html: USABLE_THIN_HTML, statusCode: 200, ok: true, finalUrl: url };
    });

    const result = await captureAuditRun(
      { auditRunId: "run-note-check", domain: "example.com" },
      deps
    );

    // Limitation note must be present and specific
    expect(result.limitationNote).not.toBeNull();
    expect(result.limitationNote).toMatch(/homepage capture was blocked/i);
    expect(result.limitationNote).toMatch(/secondary pages/i);
    // Run must NOT be marked failed
    expect(result.errorMessage).toBeUndefined();
    expect(deps.auditJobs.updateAuditRunStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" })
    );
  });

  it("403 from homepage still hard-fails without attempting secondary sweep", async () => {
    // HTTP 403 is a hard access barrier, not a bot-challenge — no secondary sweep.
    const { deps } = createDeps({
      fetchStaticStatusByUrl: { "https://example.com": 403 },
    });

    const result = await captureAuditRun(
      { auditRunId: "run-403-no-sweep", domain: "example.com" },
      deps
    );

    expect(result.errorMessage).toMatch(/target denied this audit request/i);
    expect(deps.auditJobs.updateAuditRunStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "failed", failureKind: "access_denied" })
    );
    // Secondary sweep must not have been called (no extra insertPageSnapshot)
    expect(deps.auditJobs.insertPageSnapshot).not.toHaveBeenCalled();
  });
  it("runs secondary static sweep when homepage static capture is bot-blocked", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const challengeHtml =
      "<html><head><title>Just a moment…</title></head><body>Cloudflare security check captcha verify you are human</body></html>";
    const { deps } = createDeps();

    let fetchCount = 0;
    deps.fetchStatic = vi.fn().mockImplementation(async (url: string) => {
      if (url === "https://example.com" || url === "https://example.com/") {
        fetchCount++;
        if (fetchCount === 1) { // discovery phase
          return { html: USABLE_THIN_HTML, statusCode: 200, ok: true, finalUrl: url };
        }
        // capture phase
        return { html: challengeHtml, statusCode: 200, ok: true, finalUrl: url };
      }
      return { html: USABLE_THIN_HTML, statusCode: 200, ok: true, finalUrl: url };
    });

    const result = await captureAuditRun({ auditRunId: "run-bot-capture", domain: "example.com" }, deps);
    expect(result.errorMessage).toBeUndefined();
    expect(result.limitationNote).toMatch(/homepage capture was blocked/i);
    expect(result.pagesProcessed).toBeGreaterThanOrEqual(1); // captured secondary
  });

  it("runs secondary static sweep when homepage browser capture fails and static is not usable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { deps, session } = createDeps();

    // Make `extractHtml` return the challenge HTML so it triggers capture_blocked.
    session.navigate = vi.fn().mockResolvedValue({ url: "https://example.com", ok: true, status: 200 });
    session.extractHtml = vi.fn().mockResolvedValue({ value: "<html><body>Cloudflare security check captcha verify you are human</body></html>" });

    // Secondary routes return usable thin html, homepage static returns unusable thin html
    deps.fetchStatic = vi.fn().mockImplementation(async (url: string) => {
      if (url === "https://example.com" || url === "https://example.com/") {
        return { html: "<html><body>too thin, needs browser</body></html>", statusCode: 200, ok: true, finalUrl: url };
      }
      return { html: USABLE_THIN_HTML, statusCode: 200, ok: true, finalUrl: url };
    });

    const result = await captureAuditRun({ auditRunId: "run-browser-bot-capture", domain: "example.com" }, deps);
    expect(result.errorMessage).toBeUndefined();
    expect(result.limitationNote).toMatch(/homepage capture was blocked/i);
    expect(result.pagesProcessed).toBeGreaterThanOrEqual(1); // captured secondary
  });

  it("secondary sweep parses sitemap.xml and queues same-origin links", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const challengeHtml =
      "<html><body>Cloudflare security check captcha verify you are human</body></html>";
    const sitemapXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/</loc></url>
        <url><loc>https://example.com/products/shoes</loc></url>
        <url><loc>https://example.com/products/shirts</loc></url>
        <url><loc>https://example.com/products/hats</loc></url>
        <url><loc>https://example.com/products/private?ref=feed</loc></url>
        <url><loc>https://other.com/external</loc></url>
      </urlset>
    `;

    const { deps } = createDeps();
    deps.fetchStatic = vi.fn().mockImplementation(async (url: string) => {
      if (url === "https://example.com" || url === "https://example.com/") {
        return { html: challengeHtml, statusCode: 200, ok: true, finalUrl: url };
      }
      if (url === "https://example.com/sitemap.xml") {
        return { html: sitemapXml, statusCode: 200, ok: true, finalUrl: url };
      }
      return { html: USABLE_THIN_HTML, statusCode: 200, ok: true, finalUrl: url };
    });

    const result = await captureAuditRun({ auditRunId: "run-sitemap", domain: "example.com" }, deps);
    expect(result.errorMessage).toBeUndefined();
    
    const calls = (deps.auditJobs.completePageSnapshotCapture as any).mock.calls;
    const capturedUrls = calls.map((c: any) => c[0].url);
    
    // Should capture bounded same-origin sitemap URLs and skip homepage/external/query URLs.
    expect(capturedUrls).toContain("https://example.com/products/shoes");
    expect(capturedUrls).toContain("https://example.com/products/shirts");
    expect(capturedUrls.filter((url: string) => url.startsWith("https://example.com/products/")).length)
      .toBeLessThanOrEqual(3);
    expect(capturedUrls).not.toContain("https://other.com/external"); // not same origin
    expect(capturedUrls).not.toContain("https://example.com/products/private?ref=feed"); // no query explosion
    expect(capturedUrls.filter((u: string) => u === "https://example.com/").length).toBe(0); // skipped homepage
  });

  it("recovers generic sitemap pages when hardcoded public routes are unavailable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const challengeHtml =
      "<html><body>Cloudflare security check captcha verify you are human</body></html>";
    const sitemapXml = `
      <urlset>
        <url><loc>https://example.com/work/customer-story</loc></url>
        <url><loc>https://example.com/insights/audit-guide</loc></url>
        <url><loc>https://example.com/login</loc></url>
        <url><loc>https://other.com/about</loc></url>
      </urlset>
    `;

    const { deps } = createDeps();
    deps.fetchStatic = vi.fn().mockImplementation(async (url: string) => {
      if (url === "https://example.com" || url === "https://example.com/") {
        return { html: challengeHtml, statusCode: 200, ok: true, finalUrl: url };
      }
      if (url === "https://example.com/robots.txt") {
        return { html: "User-agent: *\nAllow: /", statusCode: 200, ok: true, finalUrl: url };
      }
      if (url === "https://example.com/sitemap.xml") {
        return { html: sitemapXml, statusCode: 200, ok: true, finalUrl: url };
      }
      if (url === "https://example.com/work/customer-story" || url === "https://example.com/insights/audit-guide") {
        return { html: USABLE_THIN_HTML, statusCode: 200, ok: true, finalUrl: url };
      }
      return { html: "Not Found", statusCode: 404, ok: false, finalUrl: url };
    });

    const result = await captureAuditRun({ auditRunId: "run-generic-sitemap", domain: "example.com" }, deps);
    const capturedUrls = (deps.auditJobs.completePageSnapshotCapture as any).mock.calls.map(
      (call: any) => call[0].url
    );

    expect(result.errorMessage).toBeUndefined();
    expect(result.limitationNote).toMatch(/homepage capture was blocked/i);
    expect(capturedUrls).toContain("https://example.com/work/customer-story");
    expect(capturedUrls).toContain("https://example.com/insights/audit-guide");
    expect(capturedUrls).not.toContain("https://example.com/login");
  });

  it("uses bounded internal-link recovery and skips protected paths", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const challengeHtml =
      "<html><body>Cloudflare security check captcha verify you are human</body></html>";
    const aboutHtml = [
      "<html><head><title>Studio profile</title></head><body><nav>",
      '<a href="/portfolio">Portfolio</a>',
      '<a href="/case-studies/alpha">Case study</a>',
      '<a href="/login">Client login</a>',
      '<a href="/cart">Cart</a>',
      '<a href="/assets/brochure.pdf">PDF</a>',
      '<a href="https://other.com/contact">External</a>',
      "</nav><main><h1>Independent studio</h1><p>We design services, publish work, and help teams improve public websites.</p>",
      "<p>Contact hello@example.com for services and pricing.</p></main><footer>Privacy Terms</footer></body></html>",
    ].join("");

    const { deps } = createDeps();
    deps.fetchStatic = vi.fn().mockImplementation(async (url: string) => {
      if (url === "https://example.com" || url === "https://example.com/") {
        return { html: challengeHtml, statusCode: 200, ok: true, finalUrl: url };
      }
      if (url === "https://example.com/about") {
        return { html: aboutHtml, statusCode: 200, ok: true, finalUrl: url };
      }
      if (url === "https://example.com/portfolio" || url === "https://example.com/case-studies/alpha") {
        return { html: USABLE_THIN_HTML, statusCode: 200, ok: true, finalUrl: url };
      }
      return { html: "Not Found", statusCode: 404, ok: false, finalUrl: url };
    });

    await captureAuditRun({ auditRunId: "run-internal-links", domain: "example.com" }, deps);

    const fetchedUrls = (deps.fetchStatic as any).mock.calls.map((call: any[]) => call[0]);
    const capturedUrls = (deps.auditJobs.completePageSnapshotCapture as any).mock.calls.map(
      (call: any) => call[0].url
    );
    expect(capturedUrls).toContain("https://example.com/portfolio");
    expect(capturedUrls).toContain("https://example.com/case-studies/alpha");
    expect(fetchedUrls).not.toContain("https://example.com/login");
    expect(fetchedUrls).not.toContain("https://example.com/cart");
    expect(fetchedUrls).not.toContain("https://example.com/assets/brochure.pdf");
    expect(capturedUrls.length).toBeLessThanOrEqual(4);
  });
});
