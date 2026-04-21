import { describe, expect, it } from "vitest";
import {
  evaluateAccessibility,
  evaluateConversion,
  evaluateMessagingContent,
  evaluateMobileExperience,
  evaluatePerformance,
  evaluateTechnicalSeo,
  evaluateTrustSignals,
  evaluateUxUi,
} from "@/server/audits/evaluators";
import type { EvaluatorContext, ParsedPageMetrics } from "@/server/audits/evaluators/types";

const BASE_METRICS: ParsedPageMetrics = {
  title: { present: true, text: "Example" },
  metaDescription: { present: true, content: "Example description" },
  h1Count: 1,
  imageCount: 1,
  missingAltCount: 0,
  internalLinkCount: 3,
  externalLinkCount: 1,
  formPresent: true,
  ctaPresent: true,
  buttonCount: 2,
  canonicalPresent: true,
  robotsMeta: { present: false, content: null, noindex: false, nofollow: false },
  viewportMetaPresent: true,
  headingStructure: {
    counts: { h1: 1, h2: 2, h3: 1, h4: 0, h5: 0, h6: 0 },
    hints: [],
  },
  textFlags: [],
  trustSignals: {
    testimonials: true,
    socialProof: true,
    logoBlock: false,
    guarantee: false,
    contactInfo: true,
    privacyLink: true,
    certifications: false,
    density: 4,
  },
  ctaInventory: { count: 2, texts: ["Book a call", "Contact us"], hasDuplicates: false },
  formFriction: { fieldCount: 3, hasLabels: true, requiredCount: 1 },
  messagingQuality: { genericIntroDetected: false, heroTextLength: 120 },
  scriptCount: 4,
};

function makeContext(
  overrides: Partial<ParsedPageMetrics> = {},
  pageType: EvaluatorContext["snapshot"]["pageType"] = "homepage"
): EvaluatorContext {
  return {
    snapshot: {
      url: "https://example.com/",
      pageType,
    },
    metrics: {
      ...BASE_METRICS,
      ...overrides,
    },
  };
}

describe("specialist evaluators", () => {
  it("technical SEO evaluator emits only technical SEO findings", () => {
    const findings = evaluateTechnicalSeo(
      makeContext({
        title: { present: false, text: null },
        metaDescription: { present: false, content: null },
        canonicalPresent: false,
        h1Count: 0,
        headingStructure: {
          counts: { h1: 0, h2: 1, h3: 0, h4: 0, h5: 0, h6: 0 },
          hints: ["missing_h1", "skipped_h1_to_h3"],
        },
      })
    );

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((finding) => finding.category === "technical_seo")).toBe(true);
  });

  it("accessibility evaluator emits only accessibility findings", () => {
    const findings = evaluateAccessibility(
      makeContext({ imageCount: 3, missingAltCount: 2 })
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.category).toBe("accessibility");
  });

  it("messaging evaluator emits only messaging findings", () => {
    const findings = evaluateMessagingContent(
      makeContext({
        textFlags: ["coming_soon"],
        messagingQuality: { genericIntroDetected: true, heroTextLength: 80 },
      })
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((finding) => finding.category === "messaging_content")).toBe(true);
  });

  it("conversion evaluator emits only conversion findings", () => {
    const findings = evaluateConversion(
      makeContext({
        formPresent: false,
        ctaPresent: false,
        buttonCount: 0,
        ctaInventory: {
          count: 7,
          texts: ["Book", "Book", "Book", "Demo"],
          hasDuplicates: true,
        },
      })
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((finding) => finding.category === "conversion")).toBe(true);
  });

  it("trust evaluator emits only trust findings", () => {
    const findings = evaluateTrustSignals(
      makeContext({
        trustSignals: {
          testimonials: false,
          socialProof: false,
          logoBlock: false,
          guarantee: false,
          contactInfo: true,
          privacyLink: false,
          certifications: false,
          density: 1,
        },
      })
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.category).toBe("trust_signals");
  });

  it("mobile evaluator emits only mobile findings", () => {
    const findings = evaluateMobileExperience(
      makeContext({ viewportMetaPresent: false })
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.category).toBe("mobile_experience");
  });

  it("performance evaluator emits only performance findings", () => {
    const findings = evaluatePerformance(
      makeContext({ scriptCount: 16 })
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.category).toBe("performance");
  });

  it("ux/ui evaluator stays deterministic and returns no unsupported DOM-only findings", () => {
    expect(evaluateUxUi(makeContext())).toEqual([]);
  });
});
