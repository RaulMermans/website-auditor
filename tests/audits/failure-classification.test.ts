import { describe, expect, it } from "vitest";
import {
  classifyAuditFailure,
  detectAuditCaptureBarrier,
  getAuditFailurePresentation,
} from "@/lib/audit-failure";

describe("audit failure classification", () => {
  it("classifies 429 responses as target blocking", () => {
    expect(
      detectAuditCaptureBarrier({
        stage: "discover",
        statusCode: 429,
        url: "https://example.com",
      })
    ).toMatchObject({
      failureKind: "blocked",
      failureStage: "discover",
      failureDetails: {
        source: "target",
        marker: "http_429",
        retryable: true,
      },
    });
  });

  it("classifies bot challenge pages as capture_blocked", () => {
    expect(
      detectAuditCaptureBarrier({
        stage: "capture",
        html: "<html><title>Attention Required! | Cloudflare</title></html>",
        url: "https://example.com",
      })
    ).toMatchObject({
      failureKind: "capture_blocked",
      failureStage: "capture",
      failureDetails: {
        source: "target",
        marker: "bot_challenge",
      },
    });
  });

  it("classifies login-wall markers as auth_wall", () => {
    expect(
      detectAuditCaptureBarrier({
        stage: "discover",
        html: "<html><body>Please sign in to continue</body></html>",
        url: "https://example.com/private",
      })
    ).toMatchObject({
      failureKind: "auth_wall",
      failureStage: "discover",
      failureDetails: {
        source: "target",
      },
    });
  });

  // ─── Auth-wall high-threshold: public pages must not be mislabeled ────────

  it("does NOT classify a public marketing page with nav sign-in link as auth_wall", () => {
    // A typical nav with "Sign in" / "Log in" text on a public site.
    const result = detectAuditCaptureBarrier({
      stage: "discover",
      html: [
        "<html><body>",
        "<nav><a href='/signin'>Sign in</a> <a href='/login'>Log in</a></nav>",
        "<h1>Welcome to our service</h1>",
        "<p>Explore our features and pricing below.</p>",
        "</body></html>",
      ].join(""),
      url: "https://dontecho.com",
    });
    expect(result).toBeNull();
  });

  it("does NOT classify a bot-challenge page as auth_wall", () => {
    // A Cloudflare security challenge should be capture_blocked, not auth_wall.
    const result = detectAuditCaptureBarrier({
      stage: "discover",
      html: "<html><title>Just a moment…</title><body>Cloudflare security check captcha</body></html>",
      url: "https://example.com",
    });
    expect(result?.failureKind).toBe("capture_blocked");
    expect(result?.failureKind).not.toBe("auth_wall");
  });

  it("does NOT classify a consent/cookie wall page as auth_wall", () => {
    const result = detectAuditCaptureBarrier({
      stage: "discover",
      html: "<html><body><p>We use cookies.</p><button>Accept all</button><button>Manage cookies</button></body></html>",
      url: "https://example.com",
    });
    expect(result).toBeNull();
  });

  it("classifies HTTP 401 as auth_wall regardless of HTML content", () => {
    const result = detectAuditCaptureBarrier({
      stage: "discover",
      statusCode: 401,
      html: "<html><body>Welcome to our site</body></html>",
      url: "https://example.com/api",
    });
    expect(result?.failureKind).toBe("auth_wall");
    expect(result?.failureDetails?.marker).toBe("http_401");
  });

  it("classifies explicit gating language as auth_wall", () => {
    // "sign in to continue" is specific enough to be an auth gate.
    expect(
      detectAuditCaptureBarrier({
        stage: "capture",
        html: "<html><body><p>Sign in to continue and view your account.</p></body></html>",
        url: "https://example.com/dashboard",
      })
    ).toMatchObject({ failureKind: "auth_wall" });
  });

  it("classifies browser launch errors as runtime failures", () => {
    expect(
      classifyAuditFailure({
        stage: "capture",
        message:
          "browserType.launch: Executable doesn't exist at /var/task/.cache/ms-playwright/chromium",
      })
    ).toMatchObject({
      failureKind: "runtime_error",
      failureStage: "capture",
      failureDetails: {
        source: "runtime",
        marker: "browser_launch",
      },
    });
  });

  it("classifies analyze-stage exceptions separately from capture failures", () => {
    expect(
      classifyAuditFailure({
        stage: "analyze",
        message: "analysis failed",
      })
    ).toMatchObject({
      failureKind: "analysis_error",
      failureStage: "analyze",
      failureReason: "The analysis step failed: analysis failed",
      failureDetails: {
        source: "analysis",
        marker: "analysis_exception",
      },
    });
  });

  it("builds honest blocked-site presentation copy", () => {
    expect(
      getAuditFailurePresentation({
        status: "failed",
        failureKind: "capture_blocked",
        failureStage: "discover",
        failureReason:
          "The audit reached a security or bot-challenge page instead of the requested content. That means capture was blocked, not that the site is broken.",
        failureDetails: {
          source: "target",
          marker: "bot_challenge",
          retryable: false,
        },
      })
    ).toEqual({
      label: "Security challenge blocked capture",
      explanation:
        "The audit reached a security or bot-challenge page instead of the requested content. That means capture was blocked, not that the site is broken.",
      retryGuidance:
        "Retry only after the target allows automated capture or the security challenge is bypassed for the audited pages.",
      stageLabel: "Discovery",
    });
  });
});
