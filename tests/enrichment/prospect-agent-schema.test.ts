import { describe, it, expect } from "vitest";
import {
  ProspectAuditAgentOutputSchema,
  normalizeProspectIntelligenceResult,
} from "@/server/agents/prospect-audit-agent.schema";

const VALID_OUTPUT = {
  prospectFitScore: 72,
  commercialOpportunityScore: 68,
  captureFidelityAssessment: {
    level: "rendered_browser",
    confidence: "high",
    summary: "Full browser capture with screenshots available.",
    limitations: [],
  },
  reachOutRecommendation: {
    decision: "yes",
    rationale: "Multiple critical trust and conversion gaps found.",
    confidence: "high",
  },
  primaryGap: "No visible social proof or case studies on the homepage.",
  topOpportunities: [
    {
      title: "Add customer testimonials above the fold",
      evidence: "No testimonials detected in homepage HTML.",
      evidenceLabel: "Measured",
      businessImpact: "Trust signals reduce bounce for cold traffic.",
      recommendedAction: "Add 3-5 testimonials with name/role attribution.",
      priority: "high",
      confidence: "high",
    },
  ],
  recommendedService: {
    name: "Conversion-focused homepage redesign",
    rationale: "Homepage lacks CTAs and trust elements backed by accepted findings.",
    confidence: "medium",
  },
  outreachAngle: {
    subjectLine: "Quick observation about example.com",
    openingInsight: "Noticed no testimonials on your homepage — quick win to improve conversion.",
    messageDraft: "Hi [Name], I audited your site and found a few quick wins...",
  },
  missingEvidence: ["Analytics data to quantify bounce rate"],
  internalNotes: {
    whyNow: "Site recently redesigned — good timing for CRO feedback.",
    suggestedNextStep: "Send outreach with loom walkthrough of the 3 top findings.",
  },
};

describe("ProspectAuditAgentOutputSchema", () => {
  it("validates correct structured output", () => {
    const result = ProspectAuditAgentOutputSchema.safeParse(VALID_OUTPUT);
    expect(result.success).toBe(true);
  });

  it("rejects output with extra top-level fields", () => {
    const withExtra = { ...VALID_OUTPUT, unexpectedField: "oops" };
    const result = ProspectAuditAgentOutputSchema.safeParse(withExtra);
    expect(result.success).toBe(false);
  });

  it("rejects output missing reachOutRecommendation", () => {
    const { reachOutRecommendation: _removed, ...rest } = VALID_OUTPUT;
    const result = ProspectAuditAgentOutputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects output missing topOpportunities", () => {
    const { topOpportunities: _removed, ...rest } = VALID_OUTPUT;
    const result = ProspectAuditAgentOutputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects output with invalid reachOutRecommendation.decision", () => {
    const invalid = {
      ...VALID_OUTPUT,
      reachOutRecommendation: { ...VALID_OUTPUT.reachOutRecommendation, decision: "unsure" },
    };
    const result = ProspectAuditAgentOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects output with invalid evidenceLabel in opportunity", () => {
    const invalid = {
      ...VALID_OUTPUT,
      topOpportunities: [
        { ...VALID_OUTPUT.topOpportunities[0], evidenceLabel: "Guessed" },
      ],
    };
    const result = ProspectAuditAgentOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects scores outside 0-100", () => {
    const invalid = { ...VALID_OUTPUT, prospectFitScore: 150 };
    const result = ProspectAuditAgentOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects empty topOpportunities array", () => {
    const invalid = { ...VALID_OUTPUT, topOpportunities: [] };
    const result = ProspectAuditAgentOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("normalizeProspectIntelligenceResult", () => {
  it("returns structured output unchanged when already valid", () => {
    const result = normalizeProspectIntelligenceResult(VALID_OUTPUT);
    expect(result).not.toBeNull();
    expect(result?.reachOutRecommendation.decision).toBe("yes");
  });

  it("normalizes legacy flat JSON to structured format", () => {
    const legacy = {
      prospectFitScore: 60,
      commercialOpportunityScore: 55,
      captureFidelityAssessment: "Static HTML only; no browser evidence.",
      primaryGap: "No contact form on homepage.",
      topOpportunities: ["Add a visible contact form", "Improve CTA contrast"],
      recommendedService: "UX audit and redesign",
      outreachAngle: "Your contact flow is buried; easy fix with high impact.",
      missingEvidence: ["Mobile usability testing"],
      internalNotes: "Good SMB candidate, recently hired new dev team.",
      confidence: "medium",
    };

    const result = normalizeProspectIntelligenceResult(legacy);
    expect(result).not.toBeNull();
    expect(result?.prospectFitScore).toBe(60);
    expect(result?.reachOutRecommendation.decision).toBe("maybe");
    expect(result?.topOpportunities[0].title).toBe("Add a visible contact form");
    expect(result?.recommendedService.name).toBe("UX audit and redesign");
    expect(result?.outreachAngle.openingInsight).toBe(
      "Your contact flow is buried; easy fix with high impact."
    );
  });

  it("returns null for malformed/partial JSON", () => {
    expect(normalizeProspectIntelligenceResult(null)).toBeNull();
    expect(normalizeProspectIntelligenceResult(undefined)).toBeNull();
    expect(normalizeProspectIntelligenceResult("string")).toBeNull();
    expect(normalizeProspectIntelligenceResult({ randomKey: true })).toBeNull();
  });

  it("returns null for object with no required fields", () => {
    expect(normalizeProspectIntelligenceResult({})).toBeNull();
  });
});
