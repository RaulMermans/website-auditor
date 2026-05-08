import { createHash } from "crypto";
import type { ReportData } from "@/db/report";
import { getEnv } from "@/lib/env";
import {
  DEFAULT_CAPTURE_FIDELITY,
  isAcceptedReportFinding,
  normalizeCaptureFidelity,
  PROSPECT_AUDIT_AGENT_JSON_SCHEMA,
  PROSPECT_AUDIT_AGENT_PROMPT_VERSION,
  PROSPECT_AUDIT_AGENT_SCHEMA_VERSION,
  ProspectAuditAgentOutputSchema,
  type ProspectAuditAgentGenerationResult,
  type ProspectAuditAgentInput,
  type ProspectAuditAgentMetadata,
} from "@/server/agents/prospect-audit-agent.schema";
import { buildProspectAuditAgentPrompt } from "@/server/agents/prospect-audit-agent.prompt";

function stripJsonFence(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function getProviderErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Gemini provider/runtime failure";
}

function deriveClaimPosture(
  finding: Pick<ReportData["findings"][number], "claimPosture" | "evidenceLevel">
) {
  if (finding.claimPosture) {
    return finding.claimPosture;
  }

  if (finding.evidenceLevel === "Measured") {
    return "confirmed";
  }

  if (finding.evidenceLevel === "Observed") {
    return "observed_pattern";
  }

  return "directional";
}

export function hashProspectAuditAgentInput(input: ProspectAuditAgentInput) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function buildProspectAuditAgentInput(data: ReportData): ProspectAuditAgentInput {
  const acceptedFindings = data.findings.filter(isAcceptedReportFinding);
  const captureFidelity = normalizeCaptureFidelity(data.captureFidelity ?? DEFAULT_CAPTURE_FIDELITY);
  const limitationNotes = [
    data.auditRun.limitationNote,
    captureFidelity.primaryFidelity === "static_public"
      ? "Static-only capture excludes visual hierarchy, mobile layout, above-the-fold composition, rendered interaction states, and screenshot-based UX claims."
      : null,
    captureFidelity.primaryFidelity === "secondary_static"
      ? "Homepage capture was unavailable or blocked; intelligence is based on accessible secondary public evidence only."
      : null,
    data.auditRun.homepageOnly
      ? "Homepage-only audit. Do not generalize the findings to the full website."
      : null,
  ].filter((note): note is string => Boolean(note));

  return {
    domain: data.domain,
    homepageOnly: data.auditRun.homepageOnly,
    overallScore: data.scores.overall,
    captureFidelity,
    lightlyInspectedCategories: data.categoryReviews
      .filter((review) => review.inspectionStatus === "lightly_inspected")
      .map((review) => review.category),
    insufficientEvidenceCategories: data.categoryReviews
      .filter((review) => review.inspectionStatus === "not_inspected")
      .map((review) => review.category),
    categoryReviewSummaries: data.categoryReviews.map(
      (review) =>
        `${review.category}: ${review.headline}; ${review.observedChecks}/${review.expectedChecks} deterministic checks`
    ),
    limitationNotes,
    acceptedFindings: acceptedFindings.slice(0, 12).map((finding) => ({
      category: finding.category,
      claimPosture: deriveClaimPosture(finding),
      severity: finding.severity,
      title: finding.title,
      description: finding.description,
      evidenceLevel: finding.evidenceLevel,
      confidence: finding.confidence,
      supportType: finding.supportType ?? "inferred",
      recommendation: finding.recommendation,
    })),
  };
}

export function buildProspectAuditAgentMetadata(
  input: ProspectAuditAgentInput,
  model: string
): ProspectAuditAgentMetadata {
  return {
    model,
    promptVersion: PROSPECT_AUDIT_AGENT_PROMPT_VERSION,
    schemaVersion: PROSPECT_AUDIT_AGENT_SCHEMA_VERSION,
    inputHash: hashProspectAuditAgentInput(input),
  };
}

export async function generateProspectAuditAgent(
  input: ProspectAuditAgentInput
): Promise<ProspectAuditAgentGenerationResult> {
  const { GEMINI_API_KEY: apiKey, GEMINI_MODEL: model } = getEnv();
  if (!apiKey) return { status: "disabled" };

  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey });
  const metadata = buildProspectAuditAgentMetadata(input, model);

  try {
    const response = await client.models.generateContent({
      model,
      contents: buildProspectAuditAgentPrompt(input),
      config: {
        maxOutputTokens: 1000,
        responseMimeType: "application/json",
        responseJsonSchema: PROSPECT_AUDIT_AGENT_JSON_SCHEMA,
        temperature: 0.2,
      },
    });

    const raw = typeof response.text === "string" ? response.text : "";
    const parsed = ProspectAuditAgentOutputSchema.safeParse(JSON.parse(stripJsonFence(raw)));

    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return { status: "error", message: `LLM response failed schema validation: ${issues}` };
    }

    return { status: "success", data: parsed.data, metadata };
  } catch (error) {
    return { status: "error", message: getProviderErrorMessage(error) };
  }
}

export type {
  ProspectAuditAgentGenerationResult,
  ProspectAuditAgentInput,
  ProspectAuditAgentMetadata,
  ProspectAuditAgentResult,
  ProspectAuditAgentResultLegacy,
} from "@/server/agents/prospect-audit-agent.schema";
export { normalizeProspectIntelligenceResult } from "@/server/agents/prospect-audit-agent.schema";
