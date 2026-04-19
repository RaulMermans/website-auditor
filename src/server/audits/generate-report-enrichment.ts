import type { ReportData } from "@/db/report";
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

function stripJsonFence(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export async function generateReportEnrichment(
  input: EnrichmentPromptInput
): Promise<EnrichmentResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

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
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
    return JSON.parse(stripJsonFence(raw)) as EnrichmentResult;
  } catch {
    return null;
  }
}
