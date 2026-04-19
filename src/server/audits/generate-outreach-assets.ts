import type { EnrichmentPromptInput } from "./generate-report-enrichment";

export interface OutreachAssetSet {
  email: string;
  collaboration: string;
  loomScript: string;
}

function stripJsonFence(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export async function generateOutreachAssets(
  input: EnrichmentPromptInput
): Promise<OutreachAssetSet | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const scopeLine = input.homepageOnly ? " (homepage-only audit scope)" : "";
  const issueLine = input.findingSummaries
    .slice(0, 5)
    .map((f) => `- ${f.title}`)
    .join("\n");

  const prompt = `You are a B2B outreach specialist. Write short, specific outreach assets for a web audit engagement. Base copy ONLY on the audit data below — no invented metrics or revenue claims.

Domain: ${input.domain}${scopeLine}
Overall score: ${input.overallScore}/100
Top issues:
${issueLine || "No significant issues found."}

Respond in this exact JSON format with no extra text:
{"email":"3-4 sentence cold email. Professional, specific, no invented numbers.","collaboration":"1-2 sentences on a concrete collaboration angle from the audit.","loomScript":"2-3 sentence Loom intro script referencing specific audit findings."}`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
    return JSON.parse(stripJsonFence(raw)) as OutreachAssetSet;
  } catch {
    return null;
  }
}
