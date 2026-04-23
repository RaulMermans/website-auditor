import type { AuditJobRepository, AuditRunProgress } from "@/db/audits";
import { auditJobRepository } from "@/db/audits";
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

export async function processAuditRun(
  request: AuditCaptureRequest,
  deps: ProcessAuditRunDeps = defaultDeps
): Promise<AuditCaptureResult> {
  let progress: AuditRunProgress | null = null;

  try {
    progress = await deps.auditJobs.getAuditRunProgress(request.auditRunId);

    if (hasPendingCapture(progress)) {
      const captureResult = await deps.capture(request);

      if (captureResult.errorMessage) {
        return captureResult;
      }

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

    await deps.auditJobs.updateAuditRunStatus({
      auditRunId: request.auditRunId,
      status: "complete",
      homepageOnly: result.homepageOnly,
      failureReason: null,
    });

    return result;
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : "Unknown error";
    progress = await deps.auditJobs.getAuditRunProgress(request.auditRunId).catch(() => progress);
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
      failureReason,
    });

    return {
      ...result,
      errorMessage: failureReason,
    };
  }
}
