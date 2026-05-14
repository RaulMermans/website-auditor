import type { QueueClient } from "@/server/contracts/queue";
import { queueClient } from "@/server/contracts/queue";
import { processAuditRun } from "@/server/audits/process-audit-run";
import { isExpectedTerminalCaptureFailure } from "@/lib/report-presentation";

export interface DispatchAuditRunInput {
  jobId: string;
  auditRunId: string;
  domain: string;
  maxPages?: number;
}

export interface DispatchAuditRunDeps {
  queue: Pick<QueueClient, "complete" | "fail">;
  process: typeof processAuditRun;
}

const defaultDeps: DispatchAuditRunDeps = {
  queue: queueClient,
  process: processAuditRun,
};

export async function dispatchAuditRun(
  input: DispatchAuditRunInput,
  deps: DispatchAuditRunDeps = defaultDeps
) {
  try {
    const result = await deps.process({
      auditRunId: input.auditRunId,
      domain: input.domain,
      maxPages: input.maxPages,
    });

    if (result.errorMessage) {
      if (isExpectedTerminalCaptureFailure(result)) {
        await deps.queue.complete("audit.run", input.jobId, {
          auditRunId: result.auditRunId,
          status: "terminal_failed",
          failureKind: result.failureKind,
        });
        return result;
      }

      await deps.queue.fail("audit.run", input.jobId, {
        auditRunId: result.auditRunId,
        errorMessage: result.errorMessage,
      });
      return result;
    }

    await deps.queue.complete("audit.run", input.jobId, {
      auditRunId: result.auditRunId,
      pagesProcessed: result.pagesProcessed,
      homepageOnly: result.homepageOnly,
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    await deps.queue.fail("audit.run", input.jobId, {
      auditRunId: input.auditRunId,
      errorMessage: message,
    });

    return {
      auditRunId: input.auditRunId,
      pagesProcessed: 0,
      homepageOnly: true,
      errorMessage: message,
    };
  }
}
