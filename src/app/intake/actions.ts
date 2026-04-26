"use server";

import { redirect } from "next/navigation";
import { ZodError } from "zod";
import {
  AuditJobEnqueueError,
  createAuditJob,
} from "@/server/audits/create-audit-job";

function getPostgresErrorCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }

  return null;
}

function buildIntakeUrl(params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();

  return query ? `/intake?${query}` : "/intake";
}

export async function submitDomainAction(formData: FormData) {
  const rawDomain = String(formData.get("domain") ?? "");
  let result: Awaited<ReturnType<typeof createAuditJob>>;

  try {
    result = await createAuditJob({ domain: rawDomain });
  } catch (error) {
    if (error instanceof ZodError) {
      redirect(
        buildIntakeUrl({
          error: error.issues[0]?.message ?? "Enter a valid domain like example.com.",
          domain: rawDomain,
        })
      );
    }

    if (error instanceof AuditJobEnqueueError) {
      console.error("[intake] audit job enqueue failed", {
        auditRunId: error.auditRunId,
        error,
      });

      redirect(
        buildIntakeUrl({
          error: error.message,
          domain: rawDomain,
          auditRunId: error.auditRunId,
          status: "failed",
        })
      );
    }

    console.error("[intake] failed to save audit request", {
      code: getPostgresErrorCode(error),
      hint:
        "Verify Vercel DATABASE_URL points at the production Postgres database, then run DATABASE_URL=... npm run migrate:up.",
      error,
    });

    redirect(
      buildIntakeUrl({
        error: "We couldn't save the audit request right now.",
        domain: rawDomain,
      })
    );
  }

  // Kick the worker immediately after enqueuing — fire-and-forget, no await.
  // On Hobby the function may hit the 10s timeout for long audits, but jobs
  // won't sit unprocessed if no cron is available.
  const workerUrl = `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"}/api/worker/process`;
  fetch(workerUrl, {
    method: "POST",
    headers: process.env.WORKER_SECRET ? { "x-worker-secret": process.env.WORKER_SECRET } : {},
  }).catch(() => {});

  redirect(
    buildIntakeUrl({
      success: "1",
      domain: result.targetDomain.domain,
      auditRunId: result.auditRun.id,
      status: result.auditRun.status,
    })
  );
}
