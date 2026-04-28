import { pageAllowsIssuePattern } from "@/server/audits/page-rubrics";
import type { SpecialistEvaluator, SpecialistFindingDraft } from "./types";

export const evaluateMessagingContent: SpecialistEvaluator = ({ route, metrics }) => {
  const drafts: SpecialistFindingDraft[] = [];
  const isHomepage = pageAllowsIssuePattern(route, "weak_value_proposition");
  const isOfferPage = pageAllowsIssuePattern(route, "offer_sprawl");
  const isHighValuePage = ["homepage", "services", "pricing"].includes(route.pageType);
  const weakTrust = metrics.trustSignals.proofPoints === 0;
  const canEscalateToHigh = isHighValuePage && weakTrust;
  const weakHeroAlignment = metrics.messagingQuality.titleAlignment < 0.2;
  const weakHeroValue =
    metrics.messagingQuality.genericIntroDetected ||
    metrics.messagingQuality.heroWordCount < 4 ||
    (metrics.messagingQuality.valueCueCount === 0 && weakHeroAlignment);

  if (metrics.textFlags.length > 0) {
    drafts.push({
      category: "messaging_content",
      issueType: "placeholder_copy_visible",
      title: "Placeholder or staging copy is visible",
      description:
        "The captured page text still includes placeholder or staging language, which is directly visible in the stored page content.",
      severity: metrics.textFlags.includes("under_construction") ? "high" : "medium",
      confidence: "high",
      evidenceLevel: "Observed",
      evidenceKeys: ["page_text_flags"],
      recommendation:
        "Replace placeholder or staging copy with production messaging before sending traffic, prospects, or outreach to this page.",
      businessImpact: "high",
    });
  }

  if (isHomepage && weakHeroValue) {
    drafts.push({
      category: "messaging_content",
      issueType: "weak_value_proposition",
      title: "Homepage opening message stays broad above the fold",
      description:
        metrics.messagingQuality.genericIntroDetected
          ? "The homepage hero opens with generic introductory language instead of a specific audience, offer, or outcome. That makes the first impression more descriptive than decisive."
          : "The homepage hero copy stays broad and only loosely aligns with the title/meta language in the captured page. The opening does not quickly clarify what is offered, who it is for, and why it matters.",
      severity: weakHeroAlignment && metrics.trustSignals.density <= 1 ? "high" : "medium",
      confidence: metrics.messagingQuality.genericIntroDetected ? "high" : "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["messaging_quality", "messaging_alignment"],
      recommendation:
        "Rewrite the hero so the first screen names the audience, the offer, and the practical outcome before supporting sections begin.",
      businessImpact: "high",
    });
  }

  if (
    isOfferPage &&
    (metrics.messagingQuality.offerCueCount >= 4 || metrics.messagingQuality.h2Count >= 7)
  ) {
    drafts.push({
      category: "messaging_content",
      issueType: "offer_sprawl",
      title: "The page broadens before one core offer is established",
      description:
        `The captured page carries ${metrics.messagingQuality.h2Count} section headings and multiple offer cues. That breadth makes the story feel expansive before one core service or promise is firmly established.`,
      severity: "medium",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["messaging_alignment", "messaging_quality"],
      recommendation:
        "Tighten the page around one primary offer, then trim or subordinate side themes that dilute the main positioning.",
      businessImpact: "high",
    });
  }

  if (
    pageAllowsIssuePattern(route, "headline_section_mismatch") &&
    weakHeroAlignment &&
    metrics.messagingQuality.h2Count >= 4 &&
    metrics.messagingQuality.duplicateHeadingCount === 0
  ) {
    drafts.push({
      category: "messaging_content",
      issueType: "headline_section_mismatch",
      title: "Hero promise and downstream sections are only loosely connected",
      description:
        "The hero/title language and downstream section headings share limited overlap in the captured page. That makes the homepage read more like a stack of sections than one coherent story.",
      severity: "medium",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["messaging_alignment"],
      recommendation:
        "Rework downstream section headings so they build on the hero promise instead of introducing new angles without a clear narrative link.",
      businessImpact: "medium",
    });
  }

  if (
    pageAllowsIssuePattern(route, "unclear_audience") &&
    metrics.brandClarity.audienceCueCount === 0
  ) {
    drafts.push({
      category: "messaging_content",
      issueType: "unclear_audience",
      title: "The page does not name who it is for",
      description:
        "No audience cues were found in the captured hero zone. Visitors cannot quickly confirm they are in the right place without an explicit audience signal in the opening message.",
      severity: canEscalateToHigh ? "high" : "medium",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["brand_clarity", "messaging_quality"],
      recommendation:
        "Name the target audience explicitly in the hero — a sentence fragment or specific role name in the opening message is enough to anchor who this is for.",
      businessImpact: "high",
    });
  }

  if (
    pageAllowsIssuePattern(route, "generic_positioning") &&
    metrics.brandClarity.genericClaimCount >= 2 &&
    metrics.brandClarity.differentiationCueCount === 0
  ) {
    drafts.push({
      category: "messaging_content",
      issueType: "generic_positioning",
      title: "Positioning relies on generic claims with no differentiator",
      description:
        `The captured page copy uses ${metrics.brandClarity.genericClaimCount} generic claim phrase${metrics.brandClarity.genericClaimCount !== 1 ? "s" : ""} (such as "world-class", "comprehensive solution", "cutting-edge") without any contrasting differentiator. Generic claims lower perceived specificity without adding persuasive weight.`,
      severity: "medium",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["brand_clarity", "messaging_quality"],
      recommendation:
        "Replace or supplement generic superlatives with a specific contrast — what the business does differently, who it is uniquely suited for, or what it delivers that alternatives do not.",
      businessImpact: "high",
    });
  }

  if (
    pageAllowsIssuePattern(route, "weak_differentiation") &&
    metrics.brandClarity.differentiationCueCount === 0 &&
    metrics.messagingQuality.offerCueCount > 0
  ) {
    drafts.push({
      category: "messaging_content",
      issueType: "weak_differentiation",
      title: "Offer is present but no differentiator is stated",
      description:
        "The page describes its offer but does not signal why it is the preferred choice over alternatives. Without a differentiation cue, the offer sits in an undifferentiated category position.",
      severity: "medium",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["brand_clarity", "messaging_quality"],
      recommendation:
        "Add one clear differentiation signal — a constraint removed, a specific outcome guaranteed, a method that is distinct, or an audience that is uniquely served.",
      businessImpact: "high",
    });
  }

  if (
    pageAllowsIssuePattern(route, "vague_outcome_language") &&
    metrics.brandClarity.outcomeCueCount === 0 &&
    metrics.messagingQuality.valueCueCount === 0
  ) {
    drafts.push({
      category: "messaging_content",
      issueType: "vague_outcome_language",
      title: "No outcome language found in the captured hero zone",
      description:
        "Neither outcome-oriented language (what the visitor gains) nor value cues (what improves, grows, or is reduced) were detected in the hero area. The opening message describes the business rather than the visitor's result.",
      severity: canEscalateToHigh ? "high" : "medium",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["brand_clarity", "messaging_quality"],
      recommendation:
        "Reframe the hero message around the visitor's outcome — what they gain, save, or accomplish — rather than a description of the service or company.",
      businessImpact: "high",
    });
  }

  if (
    pageAllowsIssuePattern(route, "proof_promise_gap") &&
    metrics.brandClarity.outcomeCueCount > 0 &&
    metrics.trustSignals.proofPoints === 0
  ) {
    drafts.push({
      category: "messaging_content",
      issueType: "proof_promise_gap",
      title: "Outcome promised but no proof signals to support it",
      description:
        "The page makes outcome-oriented promises but the captured content carries no proof signals — no testimonials, social proof, logo block, case studies, or certifications were detected. That leaves the promise unsubstantiated.",
      severity: canEscalateToHigh ? "high" : "medium",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["brand_clarity", "messaging_quality"],
      recommendation:
        "Add at least one proof element near the promise — a short testimonial, a client count, a named case result, or a recognizable logo — so the outcome claim is immediately substantiated.",
      businessImpact: "high",
    });
  }

  return drafts;
};
