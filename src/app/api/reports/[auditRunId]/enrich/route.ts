import { NextResponse } from "next/server";
import { requireAuditApiKey } from "@/lib/api-auth";
import { auditJobRepository } from "@/db/audits";
import { reportRepository } from "@/db/report";
import { enrichmentRepository } from "@/db/enrichment";
import { prospectIntelligenceRepository } from "@/db/prospect-intelligence";
import { buildEnrichmentInput, generateReportEnrichment } from "@/server/audits/generate-report-enrichment";
import { generateOutreachAssets } from "@/server/audits/generate-outreach-assets";
import {
  buildProspectAuditAgentInput,
  generateProspectAuditAgent,
} from "@/server/audits/prospect-audit-agent";

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
  const prospectInput = buildProspectAuditAgentInput(reportData);

  const [enrichment, outreach, prospectAuditAgent] = await Promise.all([
    generateReportEnrichment(input),
    generateOutreachAssets(input),
    generateProspectAuditAgent(prospectInput),
  ]);

  if (
    enrichment.status === "disabled" &&
    outreach.status === "disabled" &&
    prospectAuditAgent.status === "disabled"
  ) {
    return NextResponse.json(
      { error: "LLM enrichment unavailable — GEMINI_API_KEY not configured" },
      { status: 503 }
    );
  }

  if (
    enrichment.status === "error" ||
    outreach.status === "error" ||
    prospectAuditAgent.status === "error"
  ) {
    const errorMsg =
      enrichment.status === "error"
        ? enrichment.message
        : outreach.status === "error"
          ? outreach.message
          : (prospectAuditAgent as { status: "error"; message: string }).message;
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

  if (prospectAuditAgent.status === "success") {
    await prospectIntelligenceRepository.save({
      auditRunId,
      captureFidelity: prospectInput.captureFidelity.primaryFidelity,
      result: prospectAuditAgent.data,
      metadata: prospectAuditAgent.metadata,
    });
    saved.push("prospect_intelligence");
  }

  return NextResponse.json({
    saved,
    prospectAuditAgent:
      prospectAuditAgent.status === "success" ? prospectAuditAgent.data : undefined,
  });
}
