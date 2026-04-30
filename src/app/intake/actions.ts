"use server";

import { redirect } from "next/navigation";
import { ZodError } from "zod";
import {
  AuditJobEnqueueError,
  createAuditJob,
} from "@/server/audits/create-audit-job";
import { env } from "@/lib/env";

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

function buildWorkerProcessUrl(): string {
  if (process.env.APP_URL) return `${process.env.APP_URL}/api/worker/process`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/api/worker/process`;
  return "http://localhost:3000/api/worker/process";
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

  const auditRunId = result.auditRun.id;

  // Trigger the worker synchronously before redirect so the kickoff is server-owned
  // and not subject to deferred request-tail execution. The fetch starts a new Vercel
  // function invocation for the worker; it continues independently if we time out here.
  const workerUrl = buildWorkerProcessUrl();
  console.log("[intake] worker trigger start", { auditRunId, url: workerUrl });
  const workerHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (env.WORKER_SECRET) workerHeaders["x-worker-secret"] = env.WORKER_SECRET;
  try {
    const workerRes = await fetch(workerUrl, {
      method: "POST",
      headers: workerHeaders,
      body: JSON.stringify({ auditRunId, domain: result.targetDomain.domain }),
      signal: AbortSignal.timeout(10_000),
    });
    console.log("[intake] worker trigger sent", { auditRunId, url: workerUrl, status: workerRes.status });
  } catch (err) {
    console.error("[intake] worker trigger failed", { auditRunId, url: workerUrl, err });
  }

  redirect(
    buildIntakeUrl({
      success: "1",
      domain: result.targetDomain.domain,
      auditRunId,
      status: result.auditRun.status,
    })
  );
}
