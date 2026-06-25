import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  captureRenderedPage,
  classifyBlocker,
  type RenderedCaptureResult,
} from "@/lib/capture/rendered-capture";
import type { BrowserDriver, BrowserSession } from "@/server/browser/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<BrowserSession> = {}): BrowserSession {
  return {
    navigate: vi.fn().mockResolvedValue({ url: "https://example.com/", ok: true, status: 200 }),
    getUrl: vi.fn().mockResolvedValue("https://example.com/"),
    extractHtml: vi.fn().mockResolvedValue({ value: "<html><body><h1>Test</h1></body></html>" }),
    evaluate: vi.fn().mockImplementation(({ expression }: { expression: string }) => {
      if (expression.includes("document.title")) return Promise.resolve({ value: "Test Page" });
      if (expression.includes("querySelectorAll('h1')")) return Promise.resolve({ value: ["Test"] });
      if (expression.includes("body.innerText") || expression.includes("body ?")) return Promise.resolve({ value: "Test visible content" });
      if (expression.includes("domElementCount")) {
        return Promise.resolve({
          value: { domElementCount: 50, scriptCount: 3, imageCount: 2, headingCount: 4, linkCount: 10 },
        });
      }
      if (expression.includes("innerText") || expression.includes("getAttribute")) {
        return Promise.resolve({ value: [{ text: "Get started", href: "/start", boundingBox: { x: 10, y: 20, width: 120, height: 40 } }] });
      }
      return Promise.resolve({ value: null });
    }),
    screenshot: vi.fn().mockResolvedValue({ data: Buffer.from("fake-jpg"), contentType: "image/jpeg" }),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeDriver(session?: BrowserSession): BrowserDriver {
  return {
    name: "playwright" as const,
    createSession: vi.fn().mockResolvedValue(session ?? makeSession()),
  };
}

const VALID_URL = "https://example.com/";

// ─── Type serialization ───────────────────────────────────────────────────────

describe("RenderedCaptureResult serialization", () => {
  it("is JSON-serializable in the success case", async () => {
    const result = await captureRenderedPage(VALID_URL, { driver: makeDriver() });
    expect(() => JSON.stringify(result)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(result)) as RenderedCaptureResult;
    expect(parsed.status).toBe("success");
    expect(Array.isArray(parsed.h1Texts)).toBe(true);
    expect(Array.isArray(parsed.ctaCandidates)).toBe(true);
  });

  it("is JSON-serializable in the failed case", async () => {
    const driver = makeDriver();
    (driver.createSession as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("launch failed"));
    const result = await captureRenderedPage(VALID_URL, { driver });
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(result.status).toBe("failed");
  });

  it("is JSON-serializable in the blocked case", async () => {
    const session = makeSession({
      evaluate: vi.fn().mockImplementation(({ expression }: { expression: string }) => {
        if (expression.includes("document.title")) return Promise.resolve({ value: "Attention Required! | Cloudflare" });
        if (expression.includes("querySelectorAll('h1')")) return Promise.resolve({ value: [] });
        if (expression.includes("body.innerText") || expression.includes("body ?")) return Promise.resolve({ value: "Checking your browser before accessing..." });
        return Promise.resolve({ value: null });
      }),
    });
    const result = await captureRenderedPage(VALID_URL, { driver: makeDriver(session) });
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(result.status).toBe("blocked");
  });
});

// ─── classifyBlocker ─────────────────────────────────────────────────────────

describe("classifyBlocker", () => {
  it("detects Cloudflare by title", () => {
    const result = classifyBlocker("Attention Required! | Cloudflare", "Just a moment...");
    expect(result?.kind).toBe("cloudflare");
    expect(result?.detected).toBe(true);
  });

  it("detects Cloudflare by body text", () => {
    const result = classifyBlocker("", "Checking your browser before accessing the site.");
    expect(result?.kind).toBe("cloudflare");
  });

  it("detects CAPTCHA", () => {
    const result = classifyBlocker("", "Please verify you are human to continue.");
    expect(result?.kind).toBe("captcha");
  });

  it("detects hCaptcha", () => {
    const result = classifyBlocker("", "hcaptcha required to proceed");
    expect(result?.kind).toBe("captcha");
  });

  it("detects security challenge", () => {
    const result = classifyBlocker("One more step", "Please complete the security check.");
    expect(result?.kind).toBe("security_challenge");
  });

  it("detects forbidden via HTTP 403", () => {
    const result = classifyBlocker("", "", 403);
    expect(result?.kind).toBe("forbidden");
    expect(result?.evidence).toBe("HTTP 403");
  });

  it("detects login wall via HTTP 401", () => {
    const result = classifyBlocker("", "", 401);
    expect(result?.kind).toBe("login");
    expect(result?.evidence).toBe("HTTP 401");
  });

  it("detects 403 Forbidden by page text", () => {
    const result = classifyBlocker("403 Forbidden", "Access to this resource is denied.");
    expect(result?.kind).toBe("forbidden");
  });

  it("detects login wall by body text", () => {
    const result = classifyBlocker("", "Please log in to access this page.");
    expect(result?.kind).toBe("login");
  });

  it("returns undefined for a clean page", () => {
    const result = classifyBlocker("Welcome to ACME Corp", "We build great software for you.", 200);
    expect(result).toBeUndefined();
  });

  it("returns evidence capped at 120 chars", () => {
    const longText = "cloudflare ".repeat(30);
    const result = classifyBlocker("", longText);
    expect(result?.evidence.length).toBeLessThanOrEqual(120);
  });
});

// ─── captureRenderedPage scenarios ───────────────────────────────────────────

describe("captureRenderedPage", () => {
  it("returns status:success with populated fields on a clean capture", async () => {
    const session = makeSession();
    const result = await captureRenderedPage(VALID_URL, { driver: makeDriver(session) });

    expect(result.status).toBe("success");
    expect(result.url).toBe(VALID_URL);
    expect(typeof result.capturedAt).toBe("string");
    expect(result.h1Texts).toEqual(["Test"]);
    expect(result.title).toBe("Test Page");
    expect(typeof result.visibleTextSample).toBe("string");
    expect(Array.isArray(result.ctaCandidates)).toBe(true);
  });

  it("pageMetrics fields are all numbers", async () => {
    const result = await captureRenderedPage(VALID_URL, { driver: makeDriver() });
    const m = result.pageMetrics;
    expect(typeof m.domElementCount).toBe("number");
    expect(typeof m.scriptCount).toBe("number");
    expect(typeof m.imageCount).toBe("number");
    expect(typeof m.headingCount).toBe("number");
    expect(typeof m.linkCount).toBe("number");
  });

  it("h1Texts is always an array even when evaluate() fails", async () => {
    const session = makeSession({
      evaluate: vi.fn().mockRejectedValue(new Error("evaluate failed")),
    });
    const result = await captureRenderedPage(VALID_URL, { driver: makeDriver(session) });
    expect(Array.isArray(result.h1Texts)).toBe(true);
  });

  it("ctaCandidates is always an array even when evaluate() fails", async () => {
    const session = makeSession({
      evaluate: vi.fn().mockRejectedValue(new Error("evaluate failed")),
    });
    const result = await captureRenderedPage(VALID_URL, { driver: makeDriver(session) });
    expect(Array.isArray(result.ctaCandidates)).toBe(true);
  });

  it("returns status:blocked when blocker is detected in page content", async () => {
    const session = makeSession({
      evaluate: vi.fn().mockImplementation(({ expression }: { expression: string }) => {
        if (expression.includes("document.title"))
          return Promise.resolve({ value: "Attention Required! | Cloudflare" });
        if (expression.includes("querySelectorAll('h1')")) return Promise.resolve({ value: [] });
        if (expression.includes("body.innerText") || expression.includes("body ?"))
          return Promise.resolve({ value: "Checking your browser before accessing the site." });
        return Promise.resolve({ value: null });
      }),
    });
    const result = await captureRenderedPage(VALID_URL, { driver: makeDriver(session) });

    expect(result.status).toBe("blocked");
    expect(result.blocker?.detected).toBe(true);
    expect(result.blocker?.kind).toBe("cloudflare");
  });

  it("returns status:blocked when HTTP 403 is returned", async () => {
    const session = makeSession({
      navigate: vi.fn().mockResolvedValue({ url: VALID_URL, ok: false, status: 403 }),
      evaluate: vi.fn().mockImplementation(({ expression }: { expression: string }) => {
        if (expression.includes("document.title")) return Promise.resolve({ value: "403 Forbidden" });
        if (expression.includes("querySelectorAll('h1')")) return Promise.resolve({ value: [] });
        if (expression.includes("body.innerText") || expression.includes("body ?"))
          return Promise.resolve({ value: "Access denied." });
        return Promise.resolve({ value: null });
      }),
    });
    const result = await captureRenderedPage(VALID_URL, { driver: makeDriver(session) });

    expect(result.status).toBe("blocked");
    expect(result.blocker?.kind).toBe("forbidden");
  });

  it("returns status:timeout when navigation exceeds the timeout", async () => {
    const session = makeSession({
      navigate: vi.fn().mockRejectedValue(new Error("Navigation timeout exceeded 15000ms")),
    });
    const result = await captureRenderedPage(VALID_URL, { driver: makeDriver(session) });

    expect(result.status).toBe("timeout");
    expect(result.blocker?.kind).toBe("timeout");
    expect(result.errorMessage).toMatch(/timeout/i);
  });

  it("returns status:failed when browser launch fails", async () => {
    const driver: BrowserDriver = {
      name: "playwright",
      createSession: vi.fn().mockRejectedValue(new Error("Chromium binary not found")),
    };
    const result = await captureRenderedPage(VALID_URL, { driver });

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toMatch(/browser launch failed/i);
    expect(result.h1Texts).toEqual([]);
  });

  it("returns status:failed for SSRF-protected private URLs", async () => {
    const result = await captureRenderedPage("http://192.168.1.1/admin", {
      driver: makeDriver(),
    });
    expect(result.status).toBe("failed");
    expect(result.errorMessage).toMatch(/ssrf/i);
  });

  it("stores desktop screenshot when storage is provided", async () => {
    const storedKeys: string[] = [];
    const storage = {
      put: vi.fn(async (key: string) => {
        storedKeys.push(key);
        return key;
      }),
    };
    const result = await captureRenderedPage(VALID_URL, {
      driver: makeDriver(),
      storage,
      storageKeyPrefix: "audit-runs/run-1/homepage",
    });

    expect(result.desktopScreenshotPath).toBe("audit-runs/run-1/homepage/desktop.jpg");
    expect(storedKeys).toContain("audit-runs/run-1/homepage/desktop.jpg");
  });

  it("leaves desktopScreenshotPath undefined when no storage is provided", async () => {
    const result = await captureRenderedPage(VALID_URL, { driver: makeDriver() });
    expect(result.desktopScreenshotPath).toBeUndefined();
  });

  it("always closes the browser session even when capture fails", async () => {
    const session = makeSession({
      navigate: vi.fn().mockRejectedValue(new Error("connection refused")),
    });
    const closeSpy = session.close as ReturnType<typeof vi.fn>;
    await captureRenderedPage(VALID_URL, { driver: makeDriver(session) });
    expect(closeSpy).toHaveBeenCalledOnce();
  });

  it("CTA candidates list includes only non-empty visible labels", async () => {
    const session = makeSession({
      evaluate: vi.fn().mockImplementation(({ expression }: { expression: string }) => {
        if (expression.includes("document.title")) return Promise.resolve({ value: "Clean Page" });
        if (expression.includes("querySelectorAll('h1')")) return Promise.resolve({ value: ["Welcome"] });
        if (expression.includes("body.innerText") || expression.includes("body ?"))
          return Promise.resolve({ value: "Welcome to the site." });
        if (expression.includes("domElementCount"))
          return Promise.resolve({ value: { domElementCount: 20, scriptCount: 1, imageCount: 0, headingCount: 1, linkCount: 3 } });
        if (expression.includes("innerText") || expression.includes("getAttribute")) {
          // Simulates the browser expression already filtering invisible/empty elements
          return Promise.resolve({
            value: [
              { text: "Get started", href: "/start", boundingBox: { x: 10, y: 20, width: 120, height: 40 } },
              { text: "Book a demo", href: "/demo", boundingBox: { x: 10, y: 80, width: 110, height: 40 } },
            ],
          });
        }
        return Promise.resolve({ value: null });
      }),
    });
    const result = await captureRenderedPage(VALID_URL, { driver: makeDriver(session) });

    expect(result.ctaCandidates.length).toBe(2);
    for (const cta of result.ctaCandidates) {
      expect(cta.text.length).toBeGreaterThan(0);
      expect(cta.boundingBox).toBeDefined();
      expect(typeof cta.boundingBox?.width).toBe("number");
      expect(typeof cta.boundingBox?.height).toBe("number");
    }
  });
});

// ─── Safety: no interaction methods ──────────────────────────────────────────

describe("rendered-capture safety", () => {
  const FORBIDDEN_METHODS = [
    "page.click",
    "page.fill",
    "page.press",
    "page.type",
    "page.selectOption",
    "page.setInputFiles",
    ".click(",
    ".fill(",
    ".press(",
    ".type(",
    ".selectOption(",
    ".setInputFiles(",
  ];

  it("source file does not call forbidden browser interaction methods", async () => {
    const sourceFile = path.join(process.cwd(), "src/lib/capture/rendered-capture.ts");
    const source = await readFile(sourceFile, "utf8");

    for (const method of FORBIDDEN_METHODS) {
      expect(source, `should not contain ${method}`).not.toContain(method);
    }
  });

  it("BrowserSession interface does not expose interaction methods", () => {
    const session = makeSession();
    expect(session).not.toHaveProperty("click");
    expect(session).not.toHaveProperty("fill");
    expect(session).not.toHaveProperty("press");
    expect(session).not.toHaveProperty("type");
    expect(session).not.toHaveProperty("selectOption");
    expect(session).not.toHaveProperty("setInputFiles");
  });
});

// ─── Workflow integration: fallback behavior ──────────────────────────────────

describe("capture fidelity and fallback behavior", () => {
  it("success result indicates rendered_browser fidelity is achievable", async () => {
    const result = await captureRenderedPage(VALID_URL, { driver: makeDriver() });
    // A successful result means the caller can mark capture_method = "browser"
    expect(result.status).toBe("success");
    expect(result.finalUrl).toBeDefined();
  });

  it("blocked result signals fallback is needed without evidence of bypass", async () => {
    const session = makeSession({
      evaluate: vi.fn().mockImplementation(({ expression }: { expression: string }) => {
        if (expression.includes("document.title")) return Promise.resolve({ value: "Just a moment..." });
        if (expression.includes("querySelectorAll('h1')")) return Promise.resolve({ value: [] });
        if (expression.includes("body.innerText") || expression.includes("body ?"))
          return Promise.resolve({ value: "Cloudflare is checking your browser" });
        return Promise.resolve({ value: null });
      }),
    });
    const result = await captureRenderedPage(VALID_URL, { driver: makeDriver(session) });

    expect(result.status).toBe("blocked");
    // No HTML extraction should be claimed — evidence is bounded
    expect(result.ctaCandidates).toEqual([]);
    expect(result.pageMetrics).toEqual({
      domElementCount: 0,
      scriptCount: 0,
      imageCount: 0,
      headingCount: 0,
      linkCount: 0,
    });
  });

  it("timeout result allows caller to fall back to static capture", async () => {
    const session = makeSession({
      navigate: vi.fn().mockRejectedValue(new Error("Timeout exceeded 15000ms")),
    });
    const result = await captureRenderedPage(VALID_URL, { driver: makeDriver(session) });
    expect(result.status).toBe("timeout");
    expect(result.errorMessage).toBeDefined();
  });

  it("failed result (browser launch) allows caller to fall back to static capture", async () => {
    const driver: BrowserDriver = {
      name: "playwright",
      createSession: vi.fn().mockRejectedValue(new Error("no Chromium")),
    };
    const result = await captureRenderedPage(VALID_URL, { driver });
    expect(result.status).toBe("failed");
    expect(result.errorMessage).toBeDefined();
  });
});
