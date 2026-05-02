import { NextResponse } from "next/server";
import { env } from "@/lib/env";

// Allow up to 5 minutes for the Playwright audit pipeline to complete.
export const maxDuration = 300;
import { queueClient, type QueueJob } from "@/server/contracts/queue";
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

async function parseExplicitJobBody(
  req: Request
): Promise<{ jobId?: string; auditRunId?: string; domain?: string }> {
  try {
    const text = await req.text();
    if (!text) return {};
    const body = JSON.parse(text) as Record<string, unknown>;
    return {
      jobId: typeof body.jobId === "string" ? body.jobId : undefined,
      auditRunId: typeof body.auditRunId === "string" ? body.auditRunId : undefined,
      domain: typeof body.domain === "string" ? body.domain : undefined,
    };
  } catch {
    return {};
  }
}

async function handleWorkerRequest(req: Request) {
  console.log("[worker/process] entered");

  const authError = requireWorkerSecret(req);
  if (authError) {
    console.warn("[worker/process] auth failed");
    return authError;
  }
  console.log("[worker/process] auth pass");

  const { jobId: explicitJobId, auditRunId: explicitAuditRunId, domain: explicitDomain } =
    await parseExplicitJobBody(req);

  const useExplicitPath = !!(explicitJobId && explicitAuditRunId && explicitDomain);

  let job: QueueJob<AuditRunJobPayload> | null = null;

  try {
    if (useExplicitPath) {
      console.log("[worker/process] explicit job path", {
        jobId: explicitJobId,
        auditRunId: explicitAuditRunId,
      });
      job = await queueClient.fetchById<AuditRunJobPayload>("audit.run", explicitJobId);
    } else {
      job = await queueClient.fetch<AuditRunJobPayload>("audit.run");
    }
  } catch (error) {
    console.error("[worker/process] failed to fetch job from queue", { error });
    return NextResponse.json({ error: "Queue unavailable" }, { status: 503 });
  }

  if (!job) {
    const message = useExplicitPath
      ? "Job not claimable or already processed"
      : "No jobs pending";
    console.log("[worker/process] no job acquired", { message });
    return NextResponse.json({ status: "idle", message }, { status: 200 });
  }

  const { auditRunId, domain } = job.payload;
  console.log("[worker/process] job acquired", { jobId: job.id, auditRunId, domain });

  if (!auditRunId || !domain) {
    await queueClient.fail("audit.run", job.id, { error: "Malformed job payload" });
    return NextResponse.json({ error: "Malformed job payload" }, { status: 400 });
  }

  console.log("[worker/process] dispatch start", { jobId: job.id, auditRunId, domain });
  try {
    const result = await dispatchAuditRun(
      { jobId: job.id, auditRunId, domain },
      { queue: queueClient, process: (await import("@/server/audits/process-audit-run")).processAuditRun }
    );
    if (result.errorMessage) {
      console.error("[worker/process] dispatch end: failed", { auditRunId, errorMessage: result.errorMessage });
    } else {
      console.log("[worker/process] dispatch end: completed", { auditRunId, pagesProcessed: result.pagesProcessed });
    }
    return NextResponse.json(
      { status: result.errorMessage ? "failed" : "completed", auditRunId, jobId: job.id },
      { status: result.errorMessage ? 500 : 200 }
    );
  } catch (err) {
    console.error("[worker/process] dispatch failed unexpectedly", { auditRunId, err });
    return NextResponse.json({ status: "failed", auditRunId, jobId: job.id, error: String(err) }, { status: 500 });
  }
}

export const POST = handleWorkerRequest;
