import { classifyAuditFailure } from "@/lib/audit-failure";
import type { RenderedCaptureResult } from "@/lib/capture/rendered-capture";

/**
 * Converts a RenderedCaptureResult into the shape capture-audit-run.ts needs to
 * either complete a page snapshot or hand off to the existing static-fallback path.
 *
 * This is the only place that translates the generic, reusable rendered-capture
 * service's output into this application's audit pipeline evidence model.
 */

export interface RenderedCaptureSuccessEvidence {
  status: "success";
  finalUrl: string;
  html: string;
  title?: string;
  h1Texts: string[];
  visibleTextSample: string;
  ctaCandidates: RenderedCaptureResult["ctaCandidates"];
  pageMetrics: RenderedCaptureResult["pageMetrics"];
  screenshotStorageKey: string;
}

export interface RenderedCaptureFailureEvidence {
  status: "blocked" | "timeout" | "failed";
  isBotChallenge: boolean;
  /** True when the browser runtime itself could not launch (e.g. missing Chromium binary). */
  isBrowserUnavailable: boolean;
  failureReason: string;
}

export type RenderedCaptureEvidence = RenderedCaptureSuccessEvidence | RenderedCaptureFailureEvidence;

/**
 * Classifies a non-success (or not-usable-success) RenderedCaptureResult using the
 * same failure taxonomy the rest of the capture pipeline already relies on, so
 * limitation notes and failure kinds stay consistent regardless of which capture
 * path (browser or static) produced them.
 */
function classifyRenderedCaptureFailure(result: RenderedCaptureResult, overrideMessage?: string) {
  const combinedText = [result.title, result.visibleTextSample, result.blocker?.evidence]
    .filter((part): part is string => Boolean(part))
    .join(" ");
  const message = overrideMessage ?? result.errorMessage ?? combinedText;

  return classifyAuditFailure({
    stage: "capture",
    message,
    statusCode: result.statusCode,
    html: combinedText,
    url: result.finalUrl ?? result.url,
    driver: "playwright",
  });
}

export function adaptRenderedCaptureResult(result: RenderedCaptureResult): RenderedCaptureEvidence {
  if (result.status === "success") {
    const hasBadStatus =
      typeof result.statusCode === "number" && (result.statusCode < 200 || result.statusCode >= 400);

    if (!hasBadStatus && result.desktopScreenshotPath) {
      return {
        status: "success",
        finalUrl: result.finalUrl ?? result.url,
        html: result.html,
        title: result.title,
        h1Texts: result.h1Texts,
        visibleTextSample: result.visibleTextSample,
        ctaCandidates: result.ctaCandidates,
        pageMetrics: result.pageMetrics,
        screenshotStorageKey: result.desktopScreenshotPath,
      };
    }

    const overrideMessage = hasBadStatus
      ? `Failed to load ${result.finalUrl ?? result.url}. Status: ${result.statusCode}`
      : "Rendered capture succeeded but screenshot storage failed, so browser evidence is incomplete.";
    const failure = classifyRenderedCaptureFailure(result, overrideMessage);

    return {
      status: "failed",
      isBotChallenge: failure.failureKind === "capture_blocked",
      isBrowserUnavailable: failure.failureDetails.marker === "browser_launch",
      failureReason: failure.failureReason,
    };
  }

  const failure = classifyRenderedCaptureFailure(result);

  return {
    status: result.status,
    isBotChallenge: failure.failureKind === "capture_blocked",
    isBrowserUnavailable: failure.failureDetails.marker === "browser_launch",
    failureReason: failure.failureReason,
  };
}
