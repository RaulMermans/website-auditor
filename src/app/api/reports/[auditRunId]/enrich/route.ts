import { NextResponse } from "next/server";
import { requireAuditApiKey } from "@/lib/api-auth";
import { auditJobRepository } from "@/db/audits";
import { reportRepository } from "@/db/report";
import { enrichmentRepository } from "@/db/enrichment";
import { buildEnrichmentInput, generateReportEnrichment } from "@/server/audits/generate-report-enrichment";
import { generateOutreachAssets } from "@/server/audits/generate-outreach-assets";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ auditRunId: string }> }
) {
  const authError = requireAuditApiKey(req);
  if (authError) return authError;

  const { auditRunId } = await params;

  const reportData = await reportRepository.getReportData(auditRunId);
  if (!reportData) {
    return NextResponse.json({ error: "Audit run not found" }, { status: 404 });
  }

  const input = buildEnrichmentInput(reportData);

  const [enrichment, outreach] = await Promise.all([
    generateReportEnrichment(input),
    generateOutreachAssets(input),
  ]);

  if (enrichment.status === "disabled" && outreach.status === "disabled") {
    return NextResponse.json(
      { error: "LLM enrichment unavailable — GEMINI_API_KEY not configured" },
      { status: 503 }
    );
  }

  if (enrichment.status === "error" || outreach.status === "error") {
    const errorMsg =
      enrichment.status === "error" ? enrichment.message : (outreach as { status: "error"; message: string }).message;
    await auditJobRepository.insertAuditRunAttempt({
      auditRunId,
      stage: "enrich",
      attempt: 1,
      failureKind: "analysis_error",
      evaluatorFeedback: errorMsg,
      nextRetryStrategy: "retry_enrichment",
    }).catch(() => undefined);
    return NextResponse.json(
      { error: "LLM enrichment failed — Gemini provider/runtime error" },
      { status: 502 }
    );
  }

  const saved: string[] = [];

  if (enrichment.status === "success") {
    await Promise.all([
      enrichmentRepository.saveAsset(auditRunId, "summary", enrichment.data.executiveSummary),
      enrichmentRepository.saveAsset(auditRunId, "quick_wins", enrichment.data.quickWins),
    ]);
    saved.push("summary", "quick_wins");
  }

  if (outreach.status === "success") {
    await Promise.all([
      enrichmentRepository.saveAsset(auditRunId, "email", outreach.data.email),
      enrichmentRepository.saveAsset(auditRunId, "collaboration", outreach.data.collaboration),
      enrichmentRepository.saveAsset(auditRunId, "loom_script", outreach.data.loomScript),
    ]);
    saved.push("email", "collaboration", "loom_script");
  }

  return NextResponse.json({ saved });
}
