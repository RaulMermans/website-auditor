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

  if (!enrichment && !outreach) {
    return NextResponse.json(
      { error: "LLM enrichment unavailable — ANTHROPIC_API_KEY not configured" },
      { status: 503 }
    );
  }

  const saved: string[] = [];

  if (enrichment) {
    await Promise.all([
      enrichmentRepository.saveAsset(auditRunId, "summary", enrichment.executiveSummary),
      enrichmentRepository.saveAsset(auditRunId, "quick_wins", enrichment.quickWins),
    ]);
    saved.push("summary", "quick_wins");
  }

  if (outreach) {
    await Promise.all([
      enrichmentRepository.saveAsset(auditRunId, "email", outreach.email),
      enrichmentRepository.saveAsset(auditRunId, "collaboration", outreach.collaboration),
      enrichmentRepository.saveAsset(auditRunId, "loom_script", outreach.loomScript),
    ]);
    saved.push("email", "collaboration", "loom_script");
  }

  return NextResponse.json({ saved });
}
