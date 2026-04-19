import type { ReportData } from "@/db/report";
import { getEnv } from "@/lib/env";
import type { FindingCategory } from "@/lib/types";

export interface EnrichmentPromptInput {
  domain: string;
  homepageOnly: boolean;
  overallScore: number;
  categoryScores: Record<FindingCategory, number>;
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
    ? "Scope: homepage-only audit. Do not make whole-site claims."
    : "";

  const findingLines = input.findingSummaries
    .map((f) => `- [${f.severity.toUpperCase()}/${f.evidenceLevel}] ${f.category}: ${f.title}`)
    .join("\n");

  const recLines =
    input.topRecommendations.length > 0
      ? input.topRecommendations.map((r) => `- ${r}`).join("\n")
      : "None";

  const prompt = `You are an expert web auditor writing a client-facing report. Summarize ONLY the facts provided below — do not invent metrics, scores, or claims.

Domain: ${input.domain}
${scopeLine}
Overall score: ${input.overallScore}/100

Top findings:
${findingLines}

Priority recommendations:
${recLines}

Respond in this exact JSON format with no extra text:
{"executiveSummary":"2-3 sentences grounded in the findings above","quickWins":"3-5 specific improvements derived from the recommendations above"}`;

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
