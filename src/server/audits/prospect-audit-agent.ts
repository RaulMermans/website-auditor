import { z } from "zod";
import type { ReportData, ReportCaptureFidelity } from "@/db/report";
import { getEnv } from "@/lib/env";
import type { FindingCategory } from "@/lib/types";

export interface ProspectAuditAgentInput {
  domain: string;
  homepageOnly: boolean;
  overallScore: number;
  captureFidelity: ReportCaptureFidelity;
  lightlyInspectedCategories: FindingCategory[];
  insufficientEvidenceCategories: FindingCategory[];
  categoryReviewSummaries: string[];
  acceptedFindings: Array<{
    category: FindingCategory;
    claimPosture: string;
    severity: string;
    title: string;
    description: string;
    evidenceLevel: string;
    confidence: string;
    supportType: string;
    recommendation: string;
  }>;
}

export interface ProspectAuditAgentResult {
  commercialOpportunity: string;
  brandClarityGaps: string;
  conversionWeaknesses: string;
  trustProofGaps: string;
  uxIssues: string;
  aiAutomationOpportunities: string;
  bestOutreachAngle: string;
  recommendedServiceToPitch: string;
  confidence: {
    level: "high" | "medium" | "low";
    rationale: string;
  };
}

export type ProspectAuditAgentGenerationResult =
  | { status: "disabled" }
  | { status: "success"; data: ProspectAuditAgentResult }
  | { status: "error"; message: string };

const DEFAULT_CAPTURE_FIDELITY: ReportCaptureFidelity = {
  acceptedPageCount: 0,
  browserPageCount: 0,
  staticPageCount: 0,
  fallbackStaticPageCount: 0,
  screenshotPageCount: 0,
  hasBrowserEvidence: false,
};

const ProspectAuditAgentResultSchema = z.object({
  commercialOpportunity: z.string().min(1).max(1600).trim(),
  brandClarityGaps: z.string().min(1).max(1600).trim(),
  conversionWeaknesses: z.string().min(1).max(1600).trim(),
  trustProofGaps: z.string().min(1).max(1600).trim(),
  uxIssues: z.string().min(1).max(1600).trim(),
  aiAutomationOpportunities: z.string().min(1).max(1600).trim(),
  bestOutreachAngle: z.string().min(1).max(1000).trim(),
  recommendedServiceToPitch: z.string().min(1).max(600).trim(),
  confidence: z.object({
    level: z.enum(["high", "medium", "low"]),
    rationale: z.string().min(1).max(1000).trim(),
  }).strict(),
}).strict();

const PROSPECT_AUDIT_AGENT_SCHEMA = {
  type: "object",
  properties: {
    commercialOpportunity: { type: "string" },
    brandClarityGaps: { type: "string" },
    conversionWeaknesses: { type: "string" },
    trustProofGaps: { type: "string" },
    uxIssues: { type: "string" },
    aiAutomationOpportunities: { type: "string" },
    bestOutreachAngle: { type: "string" },
    recommendedServiceToPitch: { type: "string" },
    confidence: {
      type: "object",
      properties: {
        level: { type: "string", enum: ["high", "medium", "low"] },
        rationale: { type: "string" },
      },
      required: ["level", "rationale"],
      additionalProperties: false,
    },
  },
  required: [
    "commercialOpportunity",
    "brandClarityGaps",
    "conversionWeaknesses",
    "trustProofGaps",
    "uxIssues",
    "aiAutomationOpportunities",
    "bestOutreachAngle",
    "recommendedServiceToPitch",
    "confidence",
  ],
  additionalProperties: false,
};

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

function isAcceptedFinding(finding: ReportData["findings"][number]) {
  return finding.evaluatorStatus !== "needs_review" && finding.reviewStatus !== "needs_review";
}

export function buildProspectAuditAgentInput(data: ReportData): ProspectAuditAgentInput {
  const acceptedFindings = data.findings.filter(isAcceptedFinding);

  return {
    domain: data.domain,
    homepageOnly: data.auditRun.homepageOnly,
    overallScore: data.scores.overall,
    captureFidelity: data.captureFidelity ?? DEFAULT_CAPTURE_FIDELITY,
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

function buildPrompt(input: ProspectAuditAgentInput) {
  const scopeLine = input.homepageOnly
    ? "SCOPE: homepage-only audit. Do not generalize to the full website."
    : "SCOPE: captured page set only. Do not generalize beyond captured pages.";
  const fidelity = input.captureFidelity;
  const uxBoundary = fidelity.hasBrowserEvidence
    ? "UX/UI comments are allowed only when tied to listed UX/UI findings or browser/screenshot-backed capture fidelity."
    : "No browser or screenshot-backed evidence is available. Do not make UX/UI experiential claims; say UX issues are unverified unless listed as non-browser structural signals.";
  const insufficientLine =
    input.insufficientEvidenceCategories.length > 0
      ? `Insufficient-evidence categories, do not assess as healthy or problematic unless accepted findings are listed: ${input.insufficientEvidenceCategories.join(", ")}`
      : "No insufficient-evidence categories were flagged.";
  const lightLine =
    input.lightlyInspectedCategories.length > 0
      ? `Lightly inspected categories, keep confidence bounded: ${input.lightlyInspectedCategories.join(", ")}`
      : "No lightly inspected categories were flagged.";
  const categoryLines =
    input.categoryReviewSummaries.length > 0
      ? input.categoryReviewSummaries.map((line) => `- ${line}`).join("\n")
      : "None";
  const findingLines =
    input.acceptedFindings.length > 0
      ? input.acceptedFindings
          .map(
            (finding) =>
              `- [${finding.claimPosture}/${finding.severity.toUpperCase()}/${finding.evidenceLevel}/${finding.confidence} confidence/${finding.supportType}] ${finding.category}: ${finding.title}. ${finding.description} Recommendation: ${finding.recommendation}`
          )
          .join("\n")
      : "No accepted findings were available.";

  return `You are Prospect Audit Agent, an internal client-acquisition intelligence layer for Raul.

Architecture boundary:
- You read accepted audit findings only.
- You do not control crawling, evidence extraction, scoring, review, or finding acceptance.
- You cannot create new audit findings or upgrade confidence beyond the evidence supplied.
- Measured means directly captured data; Observed means visible captured pattern; Inferred means directional only.
- Do not invent revenue loss, traffic levels, analytics, buyer personas, company size, tech stack, or business facts.

Task:
Turn the accepted audit evidence into prospect intelligence for outreach and service positioning.

Domain: ${input.domain}
${scopeLine}
Overall deterministic score: ${input.overallScore}/100
Capture fidelity: ${fidelity.acceptedPageCount} accepted page(s), ${fidelity.browserPageCount} browser capture(s), ${fidelity.staticPageCount} static capture(s), ${fidelity.fallbackStaticPageCount} fallback static capture(s), ${fidelity.screenshotPageCount} screenshot-backed page(s).
${uxBoundary}
${insufficientLine}
${lightLine}

Category review states:
${categoryLines}

Accepted findings:
${findingLines}

Respond in this exact JSON format with no extra text:
{"commercialOpportunity":"internal assessment of whether this prospect has a credible website improvement opportunity, grounded only in accepted findings","brandClarityGaps":"brand clarity gaps from messaging/content/SEO evidence only, or bounded unknown if unsupported","conversionWeaknesses":"conversion weaknesses from accepted conversion/mobile evidence only, or bounded unknown if unsupported","trustProofGaps":"trust/proof gaps from accepted trust/accessibility evidence only, or bounded unknown if unsupported","uxIssues":"UX issues only if browser/screenshot-backed evidence or accepted UX/UI findings exist; otherwise state UX is unverified","aiAutomationOpportunities":"specific AI automation opportunities Raul could credibly pitch based on the accepted findings, not speculative tech claims","bestOutreachAngle":"one concise outreach angle tied to the strongest accepted evidence","recommendedServiceToPitch":"one recommended service Raul should pitch","confidence":{"level":"high|medium|low","rationale":"explain confidence based on accepted finding strength, evidence labels, inspection coverage, and capture fidelity"}}`;
}

export async function generateProspectAuditAgent(
  input: ProspectAuditAgentInput
): Promise<ProspectAuditAgentGenerationResult> {
  const { GEMINI_API_KEY: apiKey, GEMINI_MODEL: model } = getEnv();
  if (!apiKey) return { status: "disabled" };

  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey });

  try {
    const response = await client.models.generateContent({
      model,
      contents: buildPrompt(input),
      config: {
        maxOutputTokens: 900,
        responseMimeType: "application/json",
        responseJsonSchema: PROSPECT_AUDIT_AGENT_SCHEMA,
        temperature: 0.2,
      },
    });

    const raw = typeof response.text === "string" ? response.text : "";
    const parsed = ProspectAuditAgentResultSchema.safeParse(JSON.parse(stripJsonFence(raw)));

    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return { status: "error", message: `LLM response failed schema validation: ${issues}` };
    }

    return { status: "success", data: parsed.data };
  } catch (error) {
    return { status: "error", message: getProviderErrorMessage(error) };
  }
}
