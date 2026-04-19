import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateReportEnrichment } from "@/server/audits/generate-report-enrichment";
import { generateOutreachAssets } from "@/server/audits/generate-outreach-assets";
import type { EnrichmentPromptInput } from "@/server/audits/generate-report-enrichment";

const { generateContentMock, constructorArgs } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
  constructorArgs: [] as unknown[],
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: generateContentMock,
    };

    constructor(config: unknown) {
      constructorArgs.push(config);
    }
  },
}));

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
  let savedModel: string | undefined;

  beforeEach(() => {
    savedKey = process.env.GEMINI_API_KEY;
    savedModel = process.env.GEMINI_MODEL;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
    generateContentMock.mockReset();
    constructorArgs.length = 0;
  });

  afterEach(() => {
    if (savedKey !== undefined) {
      process.env.GEMINI_API_KEY = savedKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }

    if (savedModel !== undefined) {
      process.env.GEMINI_MODEL = savedModel;
    } else {
      delete process.env.GEMINI_MODEL;
    }
  });

  it("returns null when GEMINI_API_KEY is missing", async () => {
    const result = await generateReportEnrichment(baseInput());
    expect(result).toEqual({ status: "disabled" });
  });

  it("does not throw when GEMINI_API_KEY is missing", async () => {
    await expect(generateReportEnrichment(baseInput())).resolves.not.toThrow();
  });

  it("uses the default Gemini model and parses JSON output", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        executiveSummary: "Grounded summary.",
        quickWins: "Grounded quick wins.",
      }),
    });

    const result = await generateReportEnrichment(baseInput());

    expect(result).toEqual({
      status: "success",
      data: {
        executiveSummary: "Grounded summary.",
        quickWins: "Grounded quick wins.",
      },
    });
    expect(constructorArgs[0]).toEqual({ apiKey: "test-key" });
    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-2.5-flash",
        config: expect.objectContaining({
          responseMimeType: "application/json",
        }),
      })
    );
  });
});

describe("generateOutreachAssets fallback", () => {
  let savedKey: string | undefined;
  let savedModel: string | undefined;

  beforeEach(() => {
    savedKey = process.env.GEMINI_API_KEY;
    savedModel = process.env.GEMINI_MODEL;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
    generateContentMock.mockReset();
    constructorArgs.length = 0;
  });

  afterEach(() => {
    if (savedKey !== undefined) {
      process.env.GEMINI_API_KEY = savedKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }

    if (savedModel !== undefined) {
      process.env.GEMINI_MODEL = savedModel;
    } else {
      delete process.env.GEMINI_MODEL;
    }
  });

  it("returns null when GEMINI_API_KEY is missing", async () => {
    const result = await generateOutreachAssets(baseInput());
    expect(result).toEqual({ status: "disabled" });
  });

  it("does not throw when GEMINI_API_KEY is missing", async () => {
    await expect(generateOutreachAssets(baseInput())).resolves.not.toThrow();
  });

  it("handles homepage-only input without throwing", async () => {
    const result = await generateOutreachAssets(baseInput({ homepageOnly: true }));
    expect(result).toEqual({ status: "disabled" });
  });

  it("uses GEMINI_MODEL override and keeps homepage-only scope in the prompt", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "gemini-2.5-pro";
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        email: "Grounded email.",
        collaboration: "Grounded collaboration.",
        loomScript: "Grounded Loom script.",
      }),
    });

    const result = await generateOutreachAssets(baseInput({ homepageOnly: true }));

    expect(result).toEqual({
      status: "success",
      data: {
        email: "Grounded email.",
        collaboration: "Grounded collaboration.",
        loomScript: "Grounded Loom script.",
      },
    });
    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-2.5-pro",
      })
    );
    expect(generateContentMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        contents: expect.stringContaining("homepage-only audit scope"),
      })
    );
  });
});
