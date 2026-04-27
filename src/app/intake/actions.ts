"use server";

import { after } from "next/server";
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
  if (env.NEXT_PUBLIC_APP_URL) return `${env.NEXT_PUBLIC_APP_URL}/api/worker/process`;
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

  // Register server-side worker trigger BEFORE redirect() throws.
  // after() runs on the server after the redirect response is sent.
  // This does NOT depend on client JS, browser rendering, or page hydration.
  after(async () => {
    const url = buildWorkerProcessUrl();
    const headers: Record<string, string> = {};
    if (env.WORKER_SECRET) headers["x-worker-secret"] = env.WORKER_SECRET;

    try {
      const res = await fetch(url, { method: "POST", headers });
      console.log("[intake] server-side worker trigger sent", { auditRunId, url, status: res.status });
    } catch (err) {
      console.error("[intake] server-side worker trigger failed", { auditRunId, url, err });
    }
  });

  redirect(
    buildIntakeUrl({
      success: "1",
      domain: result.targetDomain.domain,
      auditRunId,
      status: result.auditRun.status,
    })
  );
}
