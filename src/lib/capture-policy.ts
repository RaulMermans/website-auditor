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

export interface PublicHtmlEvidenceAssessment {
  usable: boolean;
  textLength: number;
  titlePresent: boolean;
  headingCount: number;
  linkCount: number;
  ctaCueCount: number;
  contactCueCount: number;
  formCount: number;
  structuralCueCount: number;
}

/**
 * Returns true when HTML appears to be a JS-rendered shell with minimal public content.
 * Threshold: fewer than 300 non-tag characters after stripping scripts/styles/tags.
 * Typical marketing homepages have 800-3000 chars; React shells have 0-50 chars.
 */
function getVisibleText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isJsShellHtml(html: string): boolean {
  return getVisibleText(html).length < 300;
}

function countMatches(html: string, pattern: RegExp) {
  return html.match(pattern)?.length ?? 0;
}

/**
 * Conservative public-evidence gate for static fallback.
 *
 * A page can be useful without browser rendering when public HTML exposes enough
 * copy/structure to support bounded findings. A bare app shell, challenge shell,
 * or mostly-empty document should not become a report.
 */
export function assessPublicHtmlEvidence(html: string): PublicHtmlEvidenceAssessment {
  const visibleText = getVisibleText(html);
  const titlePresent = /<title\b[^>]*>\s*[^<\s][\s\S]*?<\/title>/i.test(html);
  const headingCount = countMatches(html, /<h[1-6]\b/gi);
  const linkCount = countMatches(html, /<a\b[^>]*href=/gi);
  const formCount = countMatches(html, /<form\b/gi);
  const ctaCueCount = countMatches(
    visibleText,
    /\b(contact|book|schedule|start|get started|request|demo|quote|buy|sign up|subscribe|call|talk|learn more)\b/gi
  );
  const contactCueCount = countMatches(
    html,
    /href=["'](?:tel:|mailto:)|\b(contact|privacy|terms|address|phone|email)\b/gi
  );
  const structuralCueCount = [
    titlePresent,
    headingCount > 0,
    linkCount >= 2,
    ctaCueCount > 0,
    contactCueCount > 0,
    formCount > 0,
    countMatches(html, /<(main|section|article|footer|nav)\b/gi) >= 2,
  ].filter(Boolean).length;

  return {
    usable:
      visibleText.length >= 450 ||
      (visibleText.length >= 220 && structuralCueCount >= 3) ||
      (visibleText.length >= 160 && titlePresent && headingCount > 0 && (ctaCueCount > 0 || contactCueCount > 0)),
    textLength: visibleText.length,
    titlePresent,
    headingCount,
    linkCount,
    ctaCueCount,
    contactCueCount,
    formCount,
    structuralCueCount,
  };
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
