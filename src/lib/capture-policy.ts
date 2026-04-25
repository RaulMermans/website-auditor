import type { PageType } from "@/lib/types";

export type CaptureMethod = "static" | "browser" | "fallback_static" | "skip";

export type CaptureOutcomeState =
  | "public_capture_success"
  | "browser_capture_success"
  | "browser_blocked_challenge"
  | "authentication_required"
  | "rendering_failed"
  | "capture_timeout"
  | "partial_success"
  | "no_usable_public_capture";

export interface CapturePlan {
  captureMethod: CaptureMethod;
  requiresScreenshot: boolean;
  browserAllowed: boolean;
  reason: string;
}

/**
 * Decides how to capture a page given run state.
 * - When browser is degraded (challenge/block previously detected): fall back to static.
 * - Otherwise: use browser (current default), with screenshot required for homepage.
 */
export function planCaptureMethod(options: {
  pageType: PageType;
  browserDegraded: boolean;
}): CapturePlan {
  if (options.browserDegraded) {
    return {
      captureMethod: "fallback_static",
      requiresScreenshot: false,
      browserAllowed: false,
      reason: "browser_degraded",
    };
  }

  return {
    captureMethod: "browser",
    requiresScreenshot: true,
    browserAllowed: true,
    reason:
      options.pageType === "homepage"
        ? "homepage_discovery_and_screenshot"
        : "browser_default",
  };
}

export function captureOutcomeFromFailureKind(kind: string): CaptureOutcomeState {
  switch (kind) {
    case "capture_blocked":
      return "browser_blocked_challenge";
    case "auth_wall":
      return "authentication_required";
    case "runtime_error":
      return "rendering_failed";
    case "blocked":
      return "no_usable_public_capture";
    default:
      return "no_usable_public_capture";
  }
}
