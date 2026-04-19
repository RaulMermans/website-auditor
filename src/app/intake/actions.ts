"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { ZodError } from "zod";
import {
  AuditJobEnqueueError,
  createAuditJob,
} from "@/server/audits/create-audit-job";
import { dispatchAuditRun } from "@/server/audits/dispatch-audit-run";

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
      redirect(
        buildIntakeUrl({
          error: error.message,
          domain: rawDomain,
          auditRunId: error.auditRunId,
          status: "failed",
        })
      );
    }

    redirect(
      buildIntakeUrl({
        error: "We couldn't save the audit request right now.",
        domain: rawDomain,
      })
    );
  }

  after(async () => {
    await dispatchAuditRun({
      jobId: result.jobId,
      auditRunId: result.auditRun.id,
      domain: result.targetDomain.domain,
    }).catch((error) => {
      console.error("[intake] audit processing failed", {
        auditRunId: result.auditRun.id,
        error,
      });
    });
  });

  redirect(
    buildIntakeUrl({
      success: "1",
      domain: result.targetDomain.domain,
      auditRunId: result.auditRun.id,
      status: result.auditRun.status,
    })
  );
}
