import { getEnv } from "@/lib/env";
import type { EnrichmentPromptInput } from "./generate-report-enrichment";

export interface OutreachAssetSet {
  email: string;
  collaboration: string;
  loomScript: string;
}

export type OutreachAssetsGenerationResult =
  | { status: "disabled" }
  | { status: "success"; data: OutreachAssetSet }
  | { status: "error"; message: string };

const OUTREACH_SCHEMA = {
  type: "object",
  properties: {
    email: { type: "string" },
    collaboration: { type: "string" },
    loomScript: { type: "string" },
  },
  required: ["email", "collaboration", "loomScript"],
  additionalProperties: false,
};

function stripJsonFence(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function getProviderErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Gemini provider/runtime failure";
}

export async function generateOutreachAssets(
  input: EnrichmentPromptInput
): Promise<OutreachAssetsGenerationResult> {
  const { GEMINI_API_KEY: apiKey, GEMINI_MODEL: model } = getEnv();
  if (!apiKey) return { status: "disabled" };

  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey });

  const scopeLine = input.homepageOnly ? " (homepage-only audit scope)" : "";
  const insufficientLine =
    input.insufficientEvidenceCategories && input.insufficientEvidenceCategories.length > 0
      ? `Do not comment on these insufficient-evidence categories: ${input.insufficientEvidenceCategories.join(", ")}`
      : "";
  const lightlyInspectedLine =
    input.lightlyInspectedCategories && input.lightlyInspectedCategories.length > 0
      ? `Treat these as limited-evidence categories and avoid overclaiming: ${input.lightlyInspectedCategories.join(", ")}`
      : "";
  const issueLine = input.findingSummaries
    .slice(0, 5)
    .map(
      (f) =>
        `- [${f.evidenceLevel}/${f.confidence} confidence] ${f.title} (${f.support})`
    )
    .join("\n");

  const prompt = `You are a B2B outreach specialist. Write short, specific outreach assets for a web audit engagement. Base copy ONLY on the audit data below — no invented metrics or revenue claims.

Domain: ${input.domain}${scopeLine}
Overall score: ${input.overallScore}/100
${insufficientLine}
${lightlyInspectedLine}
Top issues:
${issueLine || "No significant issues found."}

Respond in this exact JSON format with no extra text:
{"email":"3-4 sentence cold email. Professional, specific, no invented numbers.","collaboration":"1-2 sentences on a concrete collaboration angle from the audit.","loomScript":"2-3 sentence Loom intro script referencing specific audit findings."}`;

  try {
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        maxOutputTokens: 512,
        responseMimeType: "application/json",
        responseJsonSchema: OUTREACH_SCHEMA,
        temperature: 0.2,
      },
    });

    const raw = typeof response.text === "string" ? response.text : "";
    return {
      status: "success",
      data: JSON.parse(stripJsonFence(raw)) as OutreachAssetSet,
    };
  } catch (error) {
    return { status: "error", message: getProviderErrorMessage(error) };
  }
}
