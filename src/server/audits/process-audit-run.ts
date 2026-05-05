import type { AuditJobRepository, AuditRunProgress } from "@/db/audits";
import { auditJobRepository } from "@/db/audits";
import { toAuditFailure } from "@/lib/audit-failure";
import { analyzeAuditRun } from "@/server/audits/analyze-audit-run";
import type {
  AuditCaptureRequest,
  AuditCaptureResult,
} from "@/server/audits/capture-audit-run";
import { captureAuditRun } from "@/server/audits/capture-audit-run";

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
  const captured = snapshots.filter((s) => s.htmlStorageKey);
  const needsReview = snapshots.filter((s) => s.pageState && NEEDS_REVIEW_STATES.has(s.pageState));
  const failed = snapshots.filter((s) => s.pageState && FAILED_PAGE_STATES.has(s.pageState));

  // Homepage must always be captured for a complete audit.
  const homepageCaptured = captured.some((s) => s.pageType === "homepage");

  if (!homepageCaptured) {
    return "failed";
  }

  // Multiple pages need human review → escalate.
  if (needsReview.length >= 2) {
    return "needs_human_review";
  }

  // Some pages failed or are needs_review but homepage was captured → partial.
  if (failed.length > 0 || needsReview.length > 0) {
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

    await deps.auditJobs.updateAuditRunStatus({
      auditRunId: request.auditRunId,
      status: completionStatus,
      homepageOnly: result.homepageOnly,
      failureReason: null,
      limitationNote,
    });

    return { ...result, limitationNote };
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
