import type { PageType } from "@/lib/types";

// "static_preferred" = try static first; escalate to browser only if HTML is thin/JS-shell.
export type CaptureMethod = "static" | "browser" | "fallback_static" | "static_preferred" | "skip";

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
 * Returns true when HTML appears to be a JS-rendered shell with minimal public content.
 * Threshold: fewer than 300 non-tag characters after stripping scripts/styles/tags.
 * Typical marketing homepages have 800-3000 chars; React shells have 0-50 chars.
 */
export function isJsShellHtml(html: string): boolean {
  const stripped = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length < 300;
}

/**
 * Decides how to capture a page given run state.
 *
 * Policy:
 * - homepage: static_preferred — try static fetch first; escalate to browser only
 *   if the HTML is a JS shell. Browser adds screenshot value but is not mandatory.
 * - secondary pages: static HTTP fetch is sufficient (no screenshot needed).
 * - any page when browserDegraded: fallback_static.
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

  if (options.pageType === "homepage") {
    return {
      captureMethod: "static_preferred",
      requiresScreenshot: false,
      browserAllowed: true,
      reason: "homepage_static_preferred",
    };
  }

  // Secondary pages: static HTTP fetch is the primary capture method.
  return {
    captureMethod: "static",
    requiresScreenshot: false,
    browserAllowed: false,
    reason: "secondary_page_static_sufficient",
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
