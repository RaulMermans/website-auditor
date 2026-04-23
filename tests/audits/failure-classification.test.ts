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
