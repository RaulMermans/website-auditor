import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { queueClient } from "@/server/contracts/queue";
import { dispatchAuditRun } from "@/server/audits/dispatch-audit-run";

interface AuditRunJobPayload {
  auditRunId: string;
  domain: string;
}

function requireWorkerSecret(req: Request): Response | null {
  const secret = env.WORKER_SECRET;
  if (!secret) return null;

  const provided =
    req.headers.get("x-worker-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

async function handleWorkerRequest(req: Request) {
  const authError = requireWorkerSecret(req);
  if (authError) return authError;

  let job: Awaited<ReturnType<typeof queueClient.fetch<AuditRunJobPayload>>> = null;

  try {
    job = await queueClient.fetch<AuditRunJobPayload>("audit.run");
  } catch (error) {
    console.error("[worker] failed to fetch job from queue", { error });
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

  console.log("[worker] processing job", { jobId: job.id, auditRunId, domain });

  const result = await dispatchAuditRun(
    { jobId: job.id, auditRunId, domain },
    { queue: queueClient, process: (await import("@/server/audits/process-audit-run")).processAuditRun }
  );

  return NextResponse.json({
    status: result.errorMessage ? "failed" : "complete",
    auditRunId: result.auditRunId,
    pagesProcessed: result.pagesProcessed,
    homepageOnly: result.homepageOnly,
    errorMessage: result.errorMessage ?? null,
  });
}

export const POST = handleWorkerRequest;
