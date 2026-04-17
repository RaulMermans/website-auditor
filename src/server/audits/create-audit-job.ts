import { z } from "zod";
import { queueClient } from "@/server/contracts/queue";
import type { AuditRun } from "@/lib/types";

export const CreateAuditJobInput = z.object({
  domain: z
    .string()
    .min(3)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "must be a valid domain (no protocol)"),
  projectId: z.string().uuid().optional(),
});

export type CreateAuditJobInput = z.infer<typeof CreateAuditJobInput>;

export interface CreateAuditJobResult {
  auditRun: Pick<AuditRun, "id" | "status" | "targetDomainId" | "homepageOnly" | "startedAt">;
  jobId: string;
}

// TODO: persist auditRun to Postgres before enqueue (Shot 2+)
export async function createAuditJob(
  input: CreateAuditJobInput
): Promise<CreateAuditJobResult> {
  const { domain } = CreateAuditJobInput.parse(input);

  const auditRunId = crypto.randomUUID();
  const targetDomainId = crypto.randomUUID();

  const auditRun: CreateAuditJobResult["auditRun"] = {
    id: auditRunId,
    status: "pending",
    targetDomainId,
    homepageOnly: false,
    startedAt: new Date(),
  };

  const job = await queueClient.enqueue("audit.run", {
    auditRunId,
    domain,
  });

  return { auditRun, jobId: job.id };
}
