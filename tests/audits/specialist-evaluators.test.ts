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
import { getRoutedPageContext } from "@/server/audits/page-rubrics";
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
    emailContact: true,
    addressInfo: false,
    contactPageLink: true,
    privacyLink: true,
    termsLink: true,
    certifications: false,
    caseStudies: false,
    density: 4,
    proofPoints: 2,
    reassuranceSignals: 2,
    contactOptions: 3,
  },
  ctaInventory: {
    count: 2,
    texts: ["Book a call", "Contact us"],
    hasDuplicates: false,
    uniqueCount: 2,
  },
  formFriction: { fieldCount: 3, hasLabels: true, requiredCount: 1 },
  messagingQuality: {
    genericIntroDetected: false,
    heroTextLength: 120,
    heroHeading: "Double qualified leads for local services teams",
    heroWordCount: 7,
    h2Count: 3,
    duplicateHeadingCount: 0,
    valueCueCount: 2,
    offerCueCount: 1,
    titleAlignment: 0.6,
  },
  pageStructure: {
    sectionCount: 4,
    headingCount: 4,
    duplicateHeadingCount: 0,
    longParagraphCount: 1,
    denseIntroCtas: 1,
    denseIntroButtons: 2,
    denseIntroHeadings: 2,
    denseIntroFieldCount: 1,
    domElementCount: 180,
  },
  assetWeight: {
    stylesheetCount: 2,
    inlineStyleBlockCount: 1,
    thirdPartyScriptCount: 1,
    eagerImageCount: 1,
    imageCount: 1,
  },
  scriptCount: 4,
  brandClarity: {
    heroHeading: "Double qualified leads for local services teams",
    heroExcerpt: "Double qualified leads for local services teams",
    audienceCueCount: 1,
    outcomeCueCount: 1,
    specificityCueCount: 0,
    differentiationCueCount: 0,
    genericClaimCount: 0,
    proofCueCount: 0,
    hasNamedAudience: true,
    hasSpecificOutcome: true,
    hasDifferentiator: false,
    hasConcreteProofCue: false,
  },
};

function makeContext(
  overrides: Partial<ParsedPageMetrics> = {},
  pageType: EvaluatorContext["snapshot"]["pageType"] = "homepage"
): EvaluatorContext {
  return {
    snapshot: {
      url: "https://example.com/",
      pageType,
      pagePriority: 0,
    },
    route: getRoutedPageContext({ pageType, pagePriority: 0 }),
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
        messagingQuality: {
          ...BASE_METRICS.messagingQuality,
          genericIntroDetected: true,
          heroTextLength: 80,
          titleAlignment: 0.1,
        },
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
          uniqueCount: 3,
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
          emailContact: false,
          addressInfo: false,
          contactPageLink: false,
          privacyLink: false,
          termsLink: false,
          certifications: false,
          caseStudies: false,
          density: 1,
          proofPoints: 0,
          reassuranceSignals: 0,
          contactOptions: 1,
        },
      })
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((finding) => finding.category === "trust_signals")).toBe(true);
  });

  it("mobile evaluator emits only mobile findings", () => {
    const findings = evaluateMobileExperience(
      makeContext({
        viewportMetaPresent: false,
        pageStructure: {
          ...BASE_METRICS.pageStructure,
          denseIntroCtas: 3,
          denseIntroButtons: 5,
        },
      })
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.category).toBe("mobile_experience");
  });

  it("performance evaluator emits only performance findings", () => {
    const findings = evaluatePerformance(
      makeContext({
        scriptCount: 16,
        assetWeight: {
          ...BASE_METRICS.assetWeight,
          thirdPartyScriptCount: 5,
          stylesheetCount: 5,
          eagerImageCount: 10,
          imageCount: 18,
        },
        pageStructure: {
          ...BASE_METRICS.pageStructure,
          domElementCount: 720,
          sectionCount: 9,
        },
        buttonCount: 8,
      })
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.category).toBe("performance");
  });

  it("ux/ui evaluator stays deterministic and uses structural evidence for dense pages", () => {
    const findings = evaluateUxUi(
      makeContext({
        formPresent: true,
        ctaInventory: {
          count: 5,
          texts: ["Book now", "Book now", "Get started"],
          hasDuplicates: false,
          uniqueCount: 3,
        },
        pageStructure: {
          ...BASE_METRICS.pageStructure,
          sectionCount: 9,
          longParagraphCount: 4,
          denseIntroCtas: 3,
          denseIntroButtons: 5,
        },
        trustSignals: {
          ...BASE_METRICS.trustSignals,
          density: 2,
        },
      })
    );

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((finding) => finding.category === "ux_ui")).toBe(true);
  });

  it("clean structural metrics do not force ux/ui findings", () => {
    expect(evaluateUxUi(makeContext())).toEqual([]);
  });

  it("unclear_audience fires on homepage when audienceCueCount is 0", () => {
    const findings = evaluateMessagingContent(
      makeContext({
        brandClarity: {
          ...BASE_METRICS.brandClarity,
          audienceCueCount: 0,
          hasNamedAudience: false,
        },
      }, "homepage")
    );
    expect(findings.some((f) => f.issueType === "unclear_audience")).toBe(true);
  });

  it("unclear_audience does not fire on about pages", () => {
    const findings = evaluateMessagingContent(
      makeContext({
        brandClarity: {
          ...BASE_METRICS.brandClarity,
          audienceCueCount: 0,
          hasNamedAudience: false,
        },
      }, "about")
    );
    expect(findings.some((f) => f.issueType === "unclear_audience")).toBe(false);
  });

  it("generic_positioning fires when generic claims exist and no differentiator", () => {
    const findings = evaluateMessagingContent(
      makeContext({
        brandClarity: {
          ...BASE_METRICS.brandClarity,
          genericClaimCount: 3,
          differentiationCueCount: 0,
          hasDifferentiator: false,
        },
      }, "homepage")
    );
    expect(findings.some((f) => f.issueType === "generic_positioning")).toBe(true);
  });

  it("generic_positioning fires on about page when threshold met", () => {
    const findings = evaluateMessagingContent(
      makeContext({
        brandClarity: {
          ...BASE_METRICS.brandClarity,
          genericClaimCount: 2,
          differentiationCueCount: 0,
          hasDifferentiator: false,
        },
      }, "about")
    );
    expect(findings.some((f) => f.issueType === "generic_positioning")).toBe(true);
  });

  it("proof_promise_gap fires when outcome promised but no proof signals", () => {
    const findings = evaluateMessagingContent(
      makeContext({
        brandClarity: {
          ...BASE_METRICS.brandClarity,
          outcomeCueCount: 2,
          proofCueCount: 0,
          hasConcreteProofCue: false,
        },
        trustSignals: {
          ...BASE_METRICS.trustSignals,
          testimonials: false,
          socialProof: false,
          logoBlock: false,
          certifications: false,
          caseStudies: false,
          proofPoints: 0,
        },
      }, "homepage")
    );
    expect(findings.some((f) => f.issueType === "proof_promise_gap")).toBe(true);
  });

  it("vague_outcome_language fires when both outcomeCueCount and valueCueCount are 0", () => {
    const findings = evaluateMessagingContent(
      makeContext({
        brandClarity: {
          ...BASE_METRICS.brandClarity,
          outcomeCueCount: 0,
          hasSpecificOutcome: false,
        },
        messagingQuality: {
          ...BASE_METRICS.messagingQuality,
          valueCueCount: 0,
        },
      }, "homepage")
    );
    expect(findings.some((f) => f.issueType === "vague_outcome_language")).toBe(true);
  });

  it("new brand clarity findings carry messaging_content category", () => {
    const findings = evaluateMessagingContent(
      makeContext({
        brandClarity: {
          ...BASE_METRICS.brandClarity,
          audienceCueCount: 0,
          genericClaimCount: 3,
          differentiationCueCount: 0,
          outcomeCueCount: 0,
          hasNamedAudience: false,
          hasDifferentiator: false,
          hasSpecificOutcome: false,
        },
        messagingQuality: {
          ...BASE_METRICS.messagingQuality,
          valueCueCount: 0,
          offerCueCount: 0,
        },
        trustSignals: {
          ...BASE_METRICS.trustSignals,
          proofPoints: 0,
        },
      }, "homepage")
    );
    const brandClarityIssues = findings.filter((f) =>
      ["unclear_audience", "generic_positioning", "vague_outcome_language"].includes(f.issueType)
    );
    expect(brandClarityIssues.length).toBeGreaterThan(0);
    expect(brandClarityIssues.every((f) => f.category === "messaging_content")).toBe(true);
    expect(brandClarityIssues.every((f) => f.evidenceLevel === "Observed")).toBe(true);
  });
});
