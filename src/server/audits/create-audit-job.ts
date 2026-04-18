import { z } from "zod";
import type { AuditJobRepository } from "@/db/audits";
import { auditJobRepository } from "@/db/audits";
import { DomainInputSchema } from "@/lib/domain";
import { queueClient } from "@/server/contracts/queue";
import type { AuditRun, TargetDomain } from "@/lib/types";

export const CreateAuditJobInput = z.object({
  domain: DomainInputSchema,
  projectId: z.string().uuid().optional(),
});

export type CreateAuditJobInput = z.infer<typeof CreateAuditJobInput>;

export interface CreateAuditJobResult {
  targetDomain: Pick<TargetDomain, "id" | "domain">;
  auditRun: Pick<AuditRun, "id" | "status" | "targetDomainId" | "homepageOnly" | "startedAt">;
  jobId: string;
}

export interface CreateAuditJobDeps {
  auditJobs: AuditJobRepository;
  queue: typeof queueClient;
}

export class AuditJobEnqueueError extends Error {
  constructor(
    readonly auditRunId: string,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "AuditJobEnqueueError";
  }
}

const defaultDeps: CreateAuditJobDeps = {
  auditJobs: auditJobRepository,
  queue: queueClient,
};

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "unknown error";
}

export async function createAuditJob(
  input: CreateAuditJobInput,
  deps: CreateAuditJobDeps = defaultDeps
): Promise<CreateAuditJobResult> {
  const { domain, projectId } = CreateAuditJobInput.parse(input);
  const persisted = await deps.auditJobs.createPendingAuditRun({
    domain,
    projectId,
  });

  try {
    const job = await deps.queue.enqueue("audit.run", {
      auditRunId: persisted.auditRun.id,
      domain,
    });

    return {
      targetDomain: {
        id: persisted.targetDomain.id,
        domain: persisted.targetDomain.domain,
      },
      auditRun: {
        id: persisted.auditRun.id,
        status: persisted.auditRun.status,
        targetDomainId: persisted.auditRun.targetDomainId,
        homepageOnly: persisted.auditRun.homepageOnly,
        startedAt: persisted.auditRun.startedAt,
      },
      jobId: job.id,
    };
  } catch (error) {
    const failureReason = `Failed to enqueue audit job: ${toErrorMessage(error)}`;

    try {
      await deps.auditJobs.markAuditRunFailed({
        auditRunId: persisted.auditRun.id,
        failureReason,
      });
    } catch (markFailedError) {
      throw new AuditJobEnqueueError(
        persisted.auditRun.id,
        "Audit request was saved, but queueing failed and the run could not be marked failed.",
        { cause: markFailedError }
      );
    }

    throw new AuditJobEnqueueError(
      persisted.auditRun.id,
      "Audit request was saved, but queueing failed. The audit run was marked failed.",
      { cause: error }
    );
  }
}
