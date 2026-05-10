import type { AuditJobRepository, AuditRunProgress } from "@/db/audits";
import { auditJobRepository } from "@/db/audits";
import { toAuditFailure } from "@/lib/audit-failure";
import { analyzeAuditRun } from "@/server/audits/analyze-audit-run";
import type {
  AuditCaptureRequest,
  AuditCaptureResult,
} from "@/server/audits/capture-audit-run";
import { captureAuditRun } from "@/server/audits/capture-audit-run";
import type { PageType } from "@/lib/types";

export interface ProcessAuditRunDeps {
  auditJobs: Pick<AuditJobRepository, "getAuditRunProgress" | "updateAuditRunStatus">;
  capture: typeof captureAuditRun;
  analyze: typeof analyzeAuditRun;
}

const defaultDeps: ProcessAuditRunDeps = {
  auditJobs: auditJobRepository,
  capture: captureAuditRun,
  analyze: analyzeAuditRun,
};

const CAPTURE_PENDING_STATES = new Set(["queued", "capturing"]);
const ANALYSIS_PENDING_STATES = new Set(["captured", "auditing", "evaluating"]);

// Pages stuck in needs_review after analysis constitute a partial or human-review result.
const NEEDS_REVIEW_STATES = new Set(["needs_review"]);
const FAILED_PAGE_STATES = new Set(["failed"]);

// High-priority pages: homepage, contact, services, pricing, product, form
const HIGH_PRIORITY_PAGE_TYPES = new Set<PageType>([
  "homepage",
  "contact",
  "services",
  "pricing",
  "product",
  "form",
]);

// Low-priority pages: legal boilerplate pages
const LOW_PRIORITY_PAGE_TYPES = new Set<PageType>(["legal", "other"]);

export function getAuditPagePriorityGroup(
  pageType: PageType | null | undefined
): "high" | "medium" | "low" {
  if (!pageType) return "medium";
  if (HIGH_PRIORITY_PAGE_TYPES.has(pageType)) return "high";
  if (LOW_PRIORITY_PAGE_TYPES.has(pageType)) return "low";
  return "medium";
}

function hasPendingCapture(progress: AuditRunProgress) {
  return (
    progress.pageSnapshots.length === 0 ||
    progress.pageSnapshots.some(
      (snapshot) => snapshot.pageState && CAPTURE_PENDING_STATES.has(snapshot.pageState)
    )
  );
}

function hasPendingAnalysis(progress: AuditRunProgress) {
  return progress.pageSnapshots.some(
    (snapshot) => snapshot.pageState && ANALYSIS_PENDING_STATES.has(snapshot.pageState)
  );
}

function summarizeProgress(progress: AuditRunProgress): AuditCaptureResult {
  const pagesProcessed = progress.pageSnapshots.filter((snapshot) => snapshot.htmlStorageKey).length;
  const homepageOnly = !progress.pageSnapshots.some(
    (snapshot) => snapshot.pageType !== "homepage" && snapshot.htmlStorageKey
  );

  return {
    auditRunId: progress.auditRun.id,
    pagesProcessed,
    homepageOnly,
  };
}

function resolveCompletionStatus(
  progress: AuditRunProgress,
  limitationNote?: string | null
): import("@/lib/types").AuditStatus {
  const snapshots = progress.pageSnapshots;
  // Pages with HTML storage (captured), regardless of analysis outcome.
  const captured = snapshots.filter((s) => s.htmlStorageKey);
  // Pages that passed analysis cleanly.
  const accepted = snapshots.filter((s) => s.pageState === "accepted" && s.htmlStorageKey);
  const needsReview = snapshots.filter((s) => s.pageState && NEEDS_REVIEW_STATES.has(s.pageState));
  const failed = snapshots.filter((s) => s.pageState && FAILED_PAGE_STATES.has(s.pageState));

  const homepageCaptured = captured.some((s) => s.pageType === "homepage");
  // Secondary non-homepage accepted pages (for homepage-blocked mode).
  const hasSecondaryCaptured = accepted.some((s) => s.pageType !== "homepage");

  // Homepage blocked but secondary evidence exists → bounded partial audit.
  // The limitation note is the authoritative signal that the run completed
  // in homepage-blocked / secondary-sweep mode.
  const isHomepageBlockedPartial =
    !homepageCaptured &&
    hasSecondaryCaptured &&
    limitationNote != null;

  if (isHomepageBlockedPartial) {
    return "partial_complete";
  }

  // No homepage and no secondary evidence → failed.
  if (!homepageCaptured && !hasSecondaryCaptured) {
    return "failed";
  }

  // No usable accepted evidence at all → failed.
  if (accepted.length === 0) {
    return "failed";
  }

  // Determine which needs_review/failed pages are high-priority.
  const reviewedOrFailedHighPriority = [...needsReview, ...failed].filter(
    (s) => getAuditPagePriorityGroup(s.pageType) === "high"
  );

  // Only legal/low-value pages were accepted → not enough for a bounded report.
  const onlyLowValueAccepted = accepted.every(
    (s) => getAuditPagePriorityGroup(s.pageType) === "low"
  );

  if (onlyLowValueAccepted) {
    return "needs_human_review";
  }

  // A high-priority page (homepage, contact, services…) could not be verified → escalate.
  if (reviewedOrFailedHighPriority.length > 0) {
    return "needs_human_review";
  }

  // Majority of all pages are problematic → too many unresolved issues for a bounded report.
  const totalPages = snapshots.length;
  const problemCount = needsReview.length + failed.length;
  if (totalPages > 0 && problemCount / totalPages > 0.5) {
    return "needs_human_review";
  }

  // Secondary/low-priority pages had review failures but enough trusted evidence exists.
  if (needsReview.length > 0 || failed.length > 0) {
    return "partial_complete";
  }

  if (limitationNote) {
    return "partial_complete";
  }

  return "complete";
}

function getProcessFailureStage(progress: AuditRunProgress | null) {
  if (!progress) {
    return "capture" as const;
  }

  if (hasPendingAnalysis(progress) && !hasPendingCapture(progress)) {
    return "analyze" as const;
  }

  if (hasPendingCapture(progress)) {
    return progress.pageSnapshots.length === 0 ? "discover" as const : "capture" as const;
  }

  return progress.auditRun.status === "analyzing" ? "analyze" as const : "capture" as const;
}

export async function processAuditRun(
  request: AuditCaptureRequest,
  deps: ProcessAuditRunDeps = defaultDeps
): Promise<AuditCaptureResult> {
  let progress: AuditRunProgress | null = null;
  let limitationNote: string | null = null;

  try {
    progress = await deps.auditJobs.getAuditRunProgress(request.auditRunId);
    limitationNote = progress.auditRun.limitationNote ?? null;

    if (hasPendingCapture(progress)) {
      const captureResult = await deps.capture(request);

      if (captureResult.errorMessage) {
        return captureResult;
      }

      limitationNote = captureResult.limitationNote ?? null;
      progress = await deps.auditJobs.getAuditRunProgress(request.auditRunId);
    }

    if (hasPendingAnalysis(progress)) {
      await deps.auditJobs.updateAuditRunStatus({
        auditRunId: request.auditRunId,
        status: "analyzing",
        homepageOnly: summarizeProgress(progress).homepageOnly,
      });

      await deps.analyze(request.auditRunId);
      progress = await deps.auditJobs.getAuditRunProgress(request.auditRunId);
    }

    const result = summarizeProgress(progress);
    const completionStatus = resolveCompletionStatus(progress, limitationNote);
    const persistedLimitationNote = completionStatus === "failed" ? null : limitationNote;

    await deps.auditJobs.updateAuditRunStatus({
      auditRunId: request.auditRunId,
      status: completionStatus,
      homepageOnly: result.homepageOnly,
      failureReason: null,
      limitationNote: persistedLimitationNote,
    });

    return { ...result, limitationNote: persistedLimitationNote };
  } catch (error) {
    progress = await deps.auditJobs.getAuditRunProgress(request.auditRunId).catch(() => progress);
    const failure = toAuditFailure(error, {
      stage: getProcessFailureStage(progress),
    });
    const result = progress
      ? summarizeProgress(progress)
      : {
          auditRunId: request.auditRunId,
          pagesProcessed: 0,
          homepageOnly: true,
        };

    await deps.auditJobs.updateAuditRunStatus({
      auditRunId: request.auditRunId,
      status: "failed",
      homepageOnly: result.homepageOnly,
      failureReason: failure.failureReason,
      failureKind: failure.failureKind,
      failureStage: failure.failureStage,
      failureDetails: failure.failureDetails,
    });

    return {
      ...result,
      errorMessage: failure.failureReason,
    };
  }
}
