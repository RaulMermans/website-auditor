import { pageAllowsIssuePattern } from "@/server/audits/page-rubrics";
import type { SpecialistEvaluator, SpecialistFindingDraft } from "./types";

export const evaluateMessagingContent: SpecialistEvaluator = ({ route, metrics }) => {
  const drafts: SpecialistFindingDraft[] = [];
  const isHomepage = pageAllowsIssuePattern(route, "weak_value_proposition");
  const isOfferPage = pageAllowsIssuePattern(route, "offer_sprawl");
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

  return drafts;
};
