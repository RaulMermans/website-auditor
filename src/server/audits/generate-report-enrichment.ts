import type { ReportData } from "@/db/report";
import { getEnv } from "@/lib/env";
import type { FindingCategory } from "@/lib/types";

export interface EnrichmentPromptInput {
  domain: string;
  homepageOnly: boolean;
  overallScore: number;
  categoryScores: Record<FindingCategory, number>;
  inspectedCategories?: FindingCategory[];
  findingSummaries: Array<{
    category: string;
    severity: string;
    title: string;
    evidenceLevel: string;
  }>;
  topRecommendations: string[];
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export function buildEnrichmentInput(data: ReportData): EnrichmentPromptInput {
  const sorted = [...data.findings].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4)
  );
  const top = sorted.slice(0, 10);

  return {
    domain: data.domain,
    homepageOnly: data.auditRun.homepageOnly,
    overallScore: data.scores.overall,
    categoryScores: data.scores.byCategory,
    inspectedCategories: data.scores.inspectedCategories,
    findingSummaries: top.map((f) => ({
      category: f.category,
      severity: f.severity,
      title: f.title,
      evidenceLevel: f.evidenceLevel,
    })),
    topRecommendations: sorted
      .filter((f) => f.severity === "critical" || f.severity === "high")
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
  const uninspected = ALL_CATEGORIES.filter((c) => !inspectedSet.includes(c));
  const coverageLine =
    uninspected.length > 0
      ? `NOT inspected (insufficient evidence — do not comment on these): ${uninspected.join(", ")}`
      : "";

  const findingLines = input.findingSummaries
    .map((f) => `- [${f.severity.toUpperCase()}/${f.evidenceLevel}] ${f.category}: ${f.title}`)
    .join("\n");

  const recLines =
    input.topRecommendations.length > 0
      ? input.topRecommendations.map((r) => `- ${r}`).join("\n")
      : "None";

  const prompt = `You are a senior website auditor writing a concise, operator-facing report. Your job is to synthesize ONLY the facts supplied below — never invent metrics, scores, page counts, or claims beyond what is listed.

RULES:
1. Each finding listed is already deduplicated — do not repeat the same issue in different words.
2. Evidence labels matter: Measured = directly observed data; Observed = pattern detected in DOM; Inferred = logical conclusion. Do not present Inferred findings as Measured facts.
3. Do not add generic filler ("this is important for SEO", "users expect...") unless it ties directly to a listed finding.
4. Do not speculate about categories not in the findings list.
5. Keep the executive summary to 2-3 sentences maximum.
6. Quick wins must reference specific issues from the findings, not generic advice.

Domain: ${input.domain}
${scopeLine}
Overall score: ${input.overallScore}/100
${coverageLine}

Top findings (all deduplicated):
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
    return {
      status: "success",
      data: JSON.parse(stripJsonFence(raw)) as EnrichmentResult,
    };
  } catch (error) {
    return { status: "error", message: getProviderErrorMessage(error) };
  }
}
