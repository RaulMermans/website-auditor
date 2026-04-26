import { z } from "zod";
import type { ReportData } from "@/db/report";
import { getEnv } from "@/lib/env";
import type { FindingCategory } from "@/lib/types";

export interface EnrichmentPromptInput {
  domain: string;
  homepageOnly: boolean;
  overallScore: number;
  categoryScores: Record<FindingCategory, number>;
  inspectedCategories?: FindingCategory[];
  lightlyInspectedCategories?: FindingCategory[];
  insufficientEvidenceCategories?: FindingCategory[];
  categoryReviewSummaries?: string[];
  findingSummaries: Array<{
    category: string;
    claimPosture: string;
    severity: string;
    title: string;
    evidenceLevel: string;
    confidence: string;
    support: string;
  }>;
  topRecommendations: string[];
}

function describeFindingSupport(finding: ReportData["findings"][number]) {
  const pageCount =
    typeof finding.evidenceRef.pageCount === "number"
      ? finding.evidenceRef.pageCount
      : finding.evidenceRef.pageUrl
        ? 1
        : 0;
  const evidenceKeyCount = Array.isArray(finding.evidenceRef.evidenceKeys)
    ? finding.evidenceRef.evidenceKeys.length
    : 0;
  const parts: string[] = [];

  if (pageCount > 0) {
    parts.push(`${pageCount} page${pageCount !== 1 ? "s" : ""}`);
  }

  if (evidenceKeyCount > 0) {
    parts.push(`${evidenceKeyCount} evidence signal${evidenceKeyCount !== 1 ? "s" : ""}`);
  }

  return parts.join(" · ") || "single-page signal";
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

export function buildEnrichmentInput(data: ReportData): EnrichmentPromptInput {
  const prioritized = data.topPriorities.length > 0 ? data.topPriorities : data.findings;
  const top = prioritized.slice(0, 10);
  const lightlyInspectedCategories = data.categoryReviews
    .filter((review) => review.inspectionStatus === "lightly_inspected")
    .map((review) => review.category);
  const insufficientEvidenceCategories = data.categoryReviews
    .filter((review) => review.inspectionStatus === "not_inspected")
    .map((review) => review.category);

  return {
    domain: data.domain,
    homepageOnly: data.auditRun.homepageOnly,
    overallScore: data.scores.overall,
    categoryScores: data.scores.byCategory,
    inspectedCategories: data.scores.inspectedCategories,
    lightlyInspectedCategories,
    insufficientEvidenceCategories,
    categoryReviewSummaries: data.categoryReviews.map(
      (review) => `${review.category}: ${review.headline}`
    ),
    findingSummaries: top.map((f) => ({
      category: f.category,
      claimPosture: deriveClaimPosture(f),
      severity: f.severity,
      title: f.title,
      evidenceLevel: f.evidenceLevel,
      confidence: f.confidence,
      support: describeFindingSupport(f),
    })),
    topRecommendations: prioritized
      .filter((f) => f.severity === "critical" || f.severity === "high" || f.severity === "medium")
      .slice(0, 5)
      .map((f) => f.recommendation),
  };
}

export interface EnrichmentResult {
  executiveSummary: string;
  quickWins: string;
}

export type ReportEnrichmentGenerationResult =
  | { status: "disabled" }
  | { status: "success"; data: EnrichmentResult }
  | { status: "error"; message: string };

// Runtime Zod schema — validates and constrains the LLM JSON response.
const EnrichmentResultSchema = z.object({
  executiveSummary: z.string().min(1).max(2000).trim(),
  quickWins: z.string().min(1).max(2000).trim(),
}).strict();

const REPORT_ENRICHMENT_SCHEMA = {
  type: "object",
  properties: {
    executiveSummary: { type: "string" },
    quickWins: { type: "string" },
  },
  required: ["executiveSummary", "quickWins"],
  additionalProperties: false,
};

function stripJsonFence(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function getProviderErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Gemini provider/runtime failure";
}

export async function generateReportEnrichment(
  input: EnrichmentPromptInput
): Promise<ReportEnrichmentGenerationResult> {
  const { GEMINI_API_KEY: apiKey, GEMINI_MODEL: model } = getEnv();
  if (!apiKey) return { status: "disabled" };

  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey });

  const scopeLine = input.homepageOnly
    ? "SCOPE: homepage-only audit. Do NOT make claims about pages not captured. Do not say 'the site' — say 'the homepage'."
    : "";

  const ALL_CATEGORIES: FindingCategory[] = [
    "performance", "technical_seo", "accessibility", "ux_ui",
    "messaging_content", "conversion", "trust_signals", "mobile_experience",
  ];
  const inspectedSet = input.inspectedCategories ?? ALL_CATEGORIES;
  const uninspected = input.insufficientEvidenceCategories ?? ALL_CATEGORIES.filter((c) => !inspectedSet.includes(c));
  const coverageLine =
    uninspected.length > 0
      ? `NOT inspected (insufficient evidence — do not comment on these): ${uninspected.join(", ")}`
      : "";
  const lightlyInspectedLine =
    input.lightlyInspectedCategories && input.lightlyInspectedCategories.length > 0
      ? `Lightly inspected (limited evidence — be cautious about certainty): ${input.lightlyInspectedCategories.join(", ")}`
      : "";

  const findingLines = input.findingSummaries
    .map(
      (f) =>
        `- [${f.claimPosture}/${f.severity.toUpperCase()}/${f.evidenceLevel}/${f.confidence} confidence] ${f.category}: ${f.title} (${f.support})`
    )
    .join("\n");
  const categoryReviewLines =
    input.categoryReviewSummaries && input.categoryReviewSummaries.length > 0
      ? input.categoryReviewSummaries.map((line) => `- ${line}`).join("\n")
      : "None";

  const recLines =
    input.topRecommendations.length > 0
      ? input.topRecommendations.map((r) => `- ${r}`).join("\n")
      : "None";

  const prompt = `You are a senior website auditor writing a concise, operator-facing report. Your job is to synthesize ONLY the facts supplied below — never invent metrics, scores, page counts, or claims beyond what is listed.

RULES:
1. Each finding listed is already deduplicated — do not repeat the same issue in different words.
2. Evidence labels matter: Measured = directly observed data; Observed = pattern detected in DOM; Inferred = logical conclusion. Do not present Inferred findings as Measured facts.
3. Claim posture matters: confirmed > observed_pattern > directional. Preserve that certainty boundary in both sections.
4. Do not add generic filler ("this is important for SEO", "users expect...") unless it ties directly to a listed finding.
5. Do not speculate about categories not in the findings list.
6. Keep the executive summary to 2-3 sentences maximum.
7. Quick wins must reference specific issues from the findings, not generic advice.
8. If evidence is light or insufficient for a category, be explicit about that limitation instead of implying a clean bill of health.

Domain: ${input.domain}
${scopeLine}
Overall score: ${input.overallScore}/100
${coverageLine}
${lightlyInspectedLine}

Category review states:
${categoryReviewLines}

Top priorities (already deduplicated, distinct, and ordered):
${findingLines}

Priority recommendations:
${recLines}

Respond in this exact JSON format with no extra text:
{"executiveSummary":"2-3 sentences grounded in the findings above only","quickWins":"3-5 specific improvements derived from the listed recommendations — no generic advice"}`;

  try {
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        maxOutputTokens: 512,
        responseMimeType: "application/json",
        responseJsonSchema: REPORT_ENRICHMENT_SCHEMA,
        temperature: 0.2,
      },
    });

    const raw = typeof response.text === "string" ? response.text : "";
    const parsed = EnrichmentResultSchema.safeParse(JSON.parse(stripJsonFence(raw)));

    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return { status: "error", message: `LLM response failed schema validation: ${issues}` };
    }

    return { status: "success", data: parsed.data };
  } catch (error) {
    return { status: "error", message: getProviderErrorMessage(error) };
  }
}
