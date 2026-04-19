import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateReportEnrichment } from "@/server/audits/generate-report-enrichment";
import { generateOutreachAssets } from "@/server/audits/generate-outreach-assets";
import type { EnrichmentPromptInput } from "@/server/audits/generate-report-enrichment";

function baseInput(overrides: Partial<EnrichmentPromptInput> = {}): EnrichmentPromptInput {
  return {
    domain: "example.com",
    homepageOnly: false,
    overallScore: 75,
    categoryScores: {
      performance: 80,
      technical_seo: 70,
      accessibility: 90,
      ux_ui: 100,
      messaging_content: 100,
      conversion: 100,
      trust_signals: 100,
      mobile_experience: 100,
    },
    findingSummaries: [
      { category: "technical_seo", severity: "high", title: "Missing meta description", evidenceLevel: "Measured" },
    ],
    topRecommendations: ["Add a meta description to every page."],
    ...overrides,
  };
}

describe("generateReportEnrichment fallback", () => {
  let savedKey: string | undefined;

  beforeEach(() => {
    savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (savedKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = savedKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it("returns null when ANTHROPIC_API_KEY is missing", async () => {
    const result = await generateReportEnrichment(baseInput());
    expect(result).toBeNull();
  });

  it("does not throw when ANTHROPIC_API_KEY is missing", async () => {
    await expect(generateReportEnrichment(baseInput())).resolves.not.toThrow();
  });
});

describe("generateOutreachAssets fallback", () => {
  let savedKey: string | undefined;

  beforeEach(() => {
    savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (savedKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = savedKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it("returns null when ANTHROPIC_API_KEY is missing", async () => {
    const result = await generateOutreachAssets(baseInput());
    expect(result).toBeNull();
  });

  it("does not throw when ANTHROPIC_API_KEY is missing", async () => {
    await expect(generateOutreachAssets(baseInput())).resolves.not.toThrow();
  });

  it("handles homepage-only input without throwing", async () => {
    const result = await generateOutreachAssets(baseInput({ homepageOnly: true }));
    expect(result).toBeNull();
  });
});
