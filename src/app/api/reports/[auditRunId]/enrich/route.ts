import { NextResponse } from "next/server";
import { reportRepository } from "@/db/report";
import { enrichmentRepository } from "@/db/enrichment";
import { buildEnrichmentInput, generateReportEnrichment } from "@/server/audits/generate-report-enrichment";
import { generateOutreachAssets } from "@/server/audits/generate-outreach-assets";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ auditRunId: string }> }
) {
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
