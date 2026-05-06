import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateReportEnrichment } from "@/server/audits/generate-report-enrichment";
import { generateOutreachAssets } from "@/server/audits/generate-outreach-assets";
import type { EnrichmentPromptInput } from "@/server/audits/generate-report-enrichment";
import {
  generateProspectAuditAgent,
  type ProspectAuditAgentInput,
} from "@/server/audits/prospect-audit-agent";
import { ProspectAuditAgentResultSchema } from "@/server/agents/prospect-audit-agent.schema";

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
      ux_ui: 0,
      messaging_content: 95,
      conversion: 95,
      trust_signals: 95,
      mobile_experience: 95,
    },
    lightlyInspectedCategories: [],
    insufficientEvidenceCategories: ["ux_ui"],
    categoryReviewSummaries: ["ux_ui: Insufficient evidence"],
    findingSummaries: [
      {
        category: "technical_seo",
        claimPosture: "confirmed",
        severity: "high",
        title: "Missing meta description",
        evidenceLevel: "Measured",
        confidence: "high",
        support: "1 page · 1 evidence signal",
      },
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

  it("includes coverage limits and support detail in the prompt", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        executiveSummary: "Grounded summary.",
        quickWins: "Grounded quick wins.",
      }),
    });

    await generateReportEnrichment(baseInput());

    expect(generateContentMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        contents: expect.stringContaining("NOT inspected (insufficient evidence"),
      })
    );
    expect(generateContentMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        contents: expect.stringContaining("1 page · 1 evidence signal"),
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

function prospectInput(overrides: Partial<ProspectAuditAgentInput> = {}): ProspectAuditAgentInput {
  return {
    domain: "example.com",
    homepageOnly: false,
    overallScore: 72,
    captureFidelity: {
      acceptedPageCount: 2,
      browserPageCount: 1,
      staticPageCount: 1,
      fallbackStaticPageCount: 0,
      secondaryStaticPageCount: 0,
      screenshotPageCount: 1,
      hasBrowserEvidence: true,
      primaryFidelity: "rendered_browser",
    },
    lightlyInspectedCategories: ["conversion"],
    insufficientEvidenceCategories: ["ux_ui"],
    categoryReviewSummaries: [
      "conversion: Light inspection with prioritized issues; 1/2 deterministic checks",
      "ux_ui: Insufficient evidence; 0/2 deterministic checks",
    ],
    limitationNotes: [],
    acceptedFindings: [
      {
        category: "conversion",
        claimPosture: "observed_pattern",
        severity: "high",
        title: "Primary CTA is difficult to distinguish",
        description: "The captured page has multiple similar-weight actions.",
        evidenceLevel: "Observed",
        confidence: "medium",
        supportType: "dom",
        recommendation: "Clarify the primary next step.",
      },
    ],
    ...overrides,
  };
}

describe("generateProspectAuditAgent", () => {
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

  it("returns disabled when GEMINI_API_KEY is missing", async () => {
    const result = await generateProspectAuditAgent(prospectInput());
    expect(result).toEqual({ status: "disabled" });
  });

  it("rejects extra Prospect Agent schema fields", () => {
    const parsed = ProspectAuditAgentResultSchema.safeParse({
      prospectFitScore: 72,
      commercialOpportunityScore: 78,
      captureFidelityAssessment: "Browser-backed.",
      primaryGap: "CTA clarity.",
      topOpportunities: ["Clarify CTA."],
      recommendedService: "Conversion sprint.",
      outreachAngle: "Lead with CTA clarity.",
      missingEvidence: ["Analytics."],
      internalNotes: "Bounded.",
      confidence: "medium",
      inventedRevenueLoss: "$50k",
    });

    expect(parsed.success).toBe(false);
  });

  it("uses accepted findings and capture fidelity in the agent prompt", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        prospectFitScore: 72,
        commercialOpportunityScore: 78,
        captureFidelityAssessment: "Browser-backed capture supports bounded UX comments.",
        primaryGap: "CTA distinction is the strongest accepted signal.",
        topOpportunities: ["Clarify the primary next step."],
        recommendedService: "Conversion-focused website audit implementation sprint.",
        outreachAngle: "Lead with the observed CTA clarity issue.",
        missingEvidence: ["Analytics and broader journey evidence."],
        internalNotes: "One browser-backed accepted finding with light conversion coverage.",
        confidence: "medium",
      }),
    });

    const result = await generateProspectAuditAgent(prospectInput());

    expect(result.status).toBe("success");
    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-2.5-flash",
        config: expect.objectContaining({
          responseMimeType: "application/json",
        }),
      })
    );
    expect(generateContentMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        contents: expect.stringContaining("Use accepted findings only"),
      })
    );
    expect(generateContentMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        contents: expect.stringContaining("1 browser capture"),
      })
    );
    expect(generateContentMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        contents: expect.stringContaining("Primary CTA is difficult to distinguish"),
      })
    );
  });

  it("blocks experiential UX claims when browser evidence is unavailable", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        prospectFitScore: 35,
        commercialOpportunityScore: 40,
        captureFidelityAssessment: "Static-only capture blocks visual claims.",
        primaryGap: "Evidence is limited.",
        topOpportunities: ["Gather browser evidence."],
        recommendedService: "Evidence-backed audit review.",
        outreachAngle: "Lead with the evidence limitation.",
        missingEvidence: ["Browser screenshot evidence."],
        internalNotes: "No browser or screenshot evidence.",
        confidence: "low",
      }),
    });

    await generateProspectAuditAgent(
      prospectInput({
        captureFidelity: {
          acceptedPageCount: 1,
          browserPageCount: 0,
          staticPageCount: 1,
          fallbackStaticPageCount: 0,
          secondaryStaticPageCount: 0,
          screenshotPageCount: 0,
          hasBrowserEvidence: false,
          primaryFidelity: "static_public",
        },
      })
    );

    expect(generateContentMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        contents: expect.stringContaining("No browser or screenshot-backed evidence is available"),
      })
    );
  });
});
