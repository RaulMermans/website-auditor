import { describe, expect, it } from "vitest";
import { adaptRenderedCaptureResult } from "@/server/audits/rendered-capture-adapter";
import type { RenderedCaptureResult } from "@/lib/capture/rendered-capture";

function makeResult(overrides: Partial<RenderedCaptureResult> = {}): RenderedCaptureResult {
  return {
    status: "success",
    url: "https://example.com/",
    finalUrl: "https://example.com/",
    statusCode: 200,
    title: "Example",
    h1Texts: ["Welcome"],
    visibleTextSample: "Welcome to Example",
    html: "<html><head><title>Example</title></head><body><h1>Welcome</h1></body></html>",
    desktopScreenshotPath: "audit-runs/run-1/homepage/desktop.jpg",
    ctaCandidates: [],
    pageMetrics: { domElementCount: 10, scriptCount: 1, imageCount: 0, headingCount: 1, linkCount: 2 },
    capturedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("adaptRenderedCaptureResult", () => {
  it("maps a clean success result to success evidence with html and screenshot key", () => {
    const evidence = adaptRenderedCaptureResult(makeResult());

    expect(evidence.status).toBe("success");
    if (evidence.status !== "success") throw new Error("expected success");
    expect(evidence.finalUrl).toBe("https://example.com/");
    expect(evidence.html).toContain("<h1>Welcome</h1>");
    expect(evidence.screenshotStorageKey).toBe("audit-runs/run-1/homepage/desktop.jpg");
  });

  it("classifies a cloudflare-blocked result as a bot challenge, not browser-unavailable", () => {
    const evidence = adaptRenderedCaptureResult(
      makeResult({
        status: "blocked",
        desktopScreenshotPath: undefined,
        html: "",
        title: "Attention Required! | Cloudflare",
        visibleTextSample: "Checking your browser before accessing the site.",
        blocker: { detected: true, kind: "cloudflare", evidence: "cloudflare" },
      })
    );

    expect(evidence.status).toBe("blocked");
    if (evidence.status === "success") throw new Error("expected failure evidence");
    expect(evidence.isBotChallenge).toBe(true);
    expect(evidence.isBrowserUnavailable).toBe(false);
  });

  it("classifies a login blocker as auth_wall-like, not a bot challenge", () => {
    const evidence = adaptRenderedCaptureResult(
      makeResult({
        status: "blocked",
        desktopScreenshotPath: undefined,
        html: "",
        title: "",
        visibleTextSample: "Please sign in to continue to your account.",
        blocker: { detected: true, kind: "login", evidence: "please sign in" },
      })
    );

    if (evidence.status === "success") throw new Error("expected failure evidence");
    expect(evidence.isBotChallenge).toBe(false);
  });

  it("classifies a timeout result as a non-challenge failure requiring fallback", () => {
    const evidence = adaptRenderedCaptureResult(
      makeResult({
        status: "timeout",
        desktopScreenshotPath: undefined,
        html: "",
        title: undefined,
        visibleTextSample: "",
        statusCode: undefined,
        errorMessage: "Navigation timeout exceeded 15000ms",
      })
    );

    expect(evidence.status).toBe("timeout");
    if (evidence.status === "success") throw new Error("expected failure evidence");
    expect(evidence.isBotChallenge).toBe(false);
    expect(evidence.failureReason).toMatch(/timed out/i);
  });

  it("classifies a browser-launch failure as browser-unavailable", () => {
    const evidence = adaptRenderedCaptureResult(
      makeResult({
        status: "failed",
        desktopScreenshotPath: undefined,
        html: "",
        title: undefined,
        visibleTextSample: "",
        statusCode: undefined,
        errorMessage: "Browser launch failed: browserType.launch: Executable doesn't exist",
      })
    );

    if (evidence.status === "success") throw new Error("expected failure evidence");
    expect(evidence.isBrowserUnavailable).toBe(true);
    expect(evidence.isBotChallenge).toBe(false);
  });

  it("downgrades a success result with a non-2xx/3xx status to a failure requiring fallback", () => {
    const evidence = adaptRenderedCaptureResult(makeResult({ statusCode: 500 }));

    expect(evidence.status).toBe("failed");
    if (evidence.status === "success") throw new Error("expected failure evidence");
    expect(evidence.isBotChallenge).toBe(false);
    expect(evidence.failureReason).toMatch(/status: 500/i);
  });

  it("downgrades a success result with no stored screenshot to a failure requiring fallback", () => {
    const evidence = adaptRenderedCaptureResult(makeResult({ desktopScreenshotPath: undefined }));

    expect(evidence.status).toBe("failed");
    if (evidence.status === "success") throw new Error("expected failure evidence");
    expect(evidence.failureReason).toMatch(/screenshot/i);
  });

  it("classifies an HTTP 429 blocked result as rate-limited, not a bot challenge", () => {
    const evidence = adaptRenderedCaptureResult(
      makeResult({
        status: "blocked",
        desktopScreenshotPath: undefined,
        html: "",
        title: "",
        visibleTextSample: "",
        statusCode: 429,
        blocker: { detected: true, kind: "rate_limited", evidence: "HTTP 429" },
      })
    );

    if (evidence.status === "success") throw new Error("expected failure evidence");
    expect(evidence.isBotChallenge).toBe(false);
  });
});
