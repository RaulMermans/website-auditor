import { NextResponse } from "next/server";
import { queueClient } from "@/server/contracts/queue";
import { dispatchAuditRun } from "@/server/audits/dispatch-audit-run";

// Allow up to 5 minutes for the Playwright audit pipeline to complete.
export const maxDuration = 300;

interface AuditRunJobPayload {
  auditRunId: string;
  domain: string;
}

export async function POST() {
  let job: Awaited<ReturnType<typeof queueClient.fetch<AuditRunJobPayload>>> = null;

  try {
    job = await queueClient.fetch<AuditRunJobPayload>("audit.run");
  } catch (error) {
    console.error("[worker/trigger] failed to fetch job from queue", { error });
    return NextResponse.json({ error: "Queue unavailable" }, { status: 503 });
  }

  if (!job) {
    return NextResponse.json({ status: "idle", message: "No jobs pending" }, { status: 200 });
  }

  const { auditRunId, domain } = job.payload;

  if (!auditRunId || !domain) {
    await queueClient.fail("audit.run", job.id, { error: "Malformed job payload" });
    return NextResponse.json({ error: "Malformed job payload" }, { status: 400 });
  }

  console.log("[worker/trigger] processing job", { jobId: job.id, auditRunId, domain });

  const result = await dispatchAuditRun(
    { jobId: job.id, auditRunId, domain },
    {
      queue: queueClient,
      process: (await import("@/server/audits/process-audit-run")).processAuditRun,
    }
  );

  return NextResponse.json({
    status: result.errorMessage ? "failed" : "complete",
    auditRunId: result.auditRunId,
    pagesProcessed: result.pagesProcessed,
    homepageOnly: result.homepageOnly,
    errorMessage: result.errorMessage ?? null,
  });
}
