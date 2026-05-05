import { afterEach, describe, expect, it, vi } from "vitest";
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
});
