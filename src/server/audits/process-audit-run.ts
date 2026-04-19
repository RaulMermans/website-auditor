import type { AuditJobRepository } from "@/db/audits";
import { auditJobRepository } from "@/db/audits";
import { analyzeAuditRun } from "@/server/audits/analyze-audit-run";
import type {
  AuditCaptureRequest,
  AuditCaptureResult,
} from "@/server/audits/capture-audit-run";
import { captureAuditRun } from "@/server/audits/capture-audit-run";

export interface ProcessAuditRunDeps {
  auditJobs: Pick<AuditJobRepository, "updateAuditRunStatus">;
  capture: typeof captureAuditRun;
  analyze: typeof analyzeAuditRun;
}

const defaultDeps: ProcessAuditRunDeps = {
  auditJobs: auditJobRepository,
  capture: captureAuditRun,
  analyze: analyzeAuditRun,
};

export async function processAuditRun(
  request: AuditCaptureRequest,
  deps: ProcessAuditRunDeps = defaultDeps
): Promise<AuditCaptureResult> {
  let captureResult: AuditCaptureResult | undefined;

  try {
    captureResult = await deps.capture(request);

    if (captureResult.errorMessage) {
      return captureResult;
    }

    await deps.auditJobs.updateAuditRunStatus({
      auditRunId: request.auditRunId,
      status: "analyzing",
      homepageOnly: captureResult.homepageOnly,
    });

    await deps.analyze(request.auditRunId);

    await deps.auditJobs.updateAuditRunStatus({
      auditRunId: request.auditRunId,
      status: "complete",
      homepageOnly: captureResult.homepageOnly,
    });

    return captureResult;
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : "Unknown error";
    const homepageOnly = captureResult?.homepageOnly ?? true;

    await deps.auditJobs.updateAuditRunStatus({
      auditRunId: request.auditRunId,
      status: "failed",
      homepageOnly,
      failureReason,
    });

    return {
      auditRunId: captureResult?.auditRunId ?? request.auditRunId,
      pagesProcessed: captureResult?.pagesProcessed ?? 0,
      homepageOnly,
      errorMessage: failureReason,
    };
  }
}
