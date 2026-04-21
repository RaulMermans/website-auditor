import type { SpecialistEvaluator, SpecialistFindingDraft } from "./types";

export const evaluateMessagingContent: SpecialistEvaluator = ({ snapshot, metrics }) => {
  const drafts: SpecialistFindingDraft[] = [];
  const isHomepage = snapshot.pageType === "homepage";
  const isOfferPage = isHomepage || snapshot.pageType === "services";
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
        "The captured page text includes placeholder or staging language, which is directly visible in the stored browser evidence.",
      severity: metrics.textFlags.includes("under_construction") ? "high" : "medium",
      confidence: "high",
      evidenceLevel: "Observed",
      evidenceKeys: ["page_text_flags"],
      recommendation:
        "Replace placeholder or staging copy with production messaging before using this page in audits or outreach.",
      businessImpact: "high",
    });
  }

  if (isHomepage && weakHeroValue) {
    drafts.push({
      category: "messaging_content",
      issueType: "weak_value_proposition",
      title: "Homepage value proposition is still too generic above the fold",
      description:
        metrics.messagingQuality.genericIntroDetected
          ? "The homepage hero opens with generic introductory language instead of a specific audience, offer, or outcome. That makes the first impression descriptive rather than persuasive."
          : "The homepage hero copy stays broad and loosely aligned with the title/meta language in the captured page. The opening does not clearly communicate what is offered, for whom, and why it matters.",
      severity: weakHeroAlignment && metrics.trustSignals.density <= 1 ? "high" : "medium",
      confidence: metrics.messagingQuality.genericIntroDetected ? "high" : "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["messaging_quality", "messaging_alignment"],
      recommendation:
        "Rewrite the hero to name the audience, the offer, and the outcome in one tight statement before supporting sections begin.",
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
      title: "The page broadens into too many themes before one offer is clear",
      description:
        `The captured page carries ${metrics.messagingQuality.h2Count} section headings and multiple offer cues. That breadth makes the narrative feel expansive before a single core service or promise is firmly established.`,
      severity: "medium",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["messaging_alignment", "messaging_quality"],
      recommendation:
        "Tighten the page around one primary offer and reduce side themes that dilute the main positioning.",
      businessImpact: "high",
    });
  }

  if (
    isHomepage &&
    weakHeroAlignment &&
    metrics.messagingQuality.h2Count >= 4 &&
    metrics.messagingQuality.duplicateHeadingCount === 0
  ) {
    drafts.push({
      category: "messaging_content",
      issueType: "headline_section_mismatch",
      title: "Hero promise and downstream sections feel loosely connected",
      description:
        "The hero/title language and downstream section headings share limited overlap in the captured page. That makes the homepage read more like a collection of sections than one coherent story.",
      severity: "medium",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["messaging_alignment"],
      recommendation:
        "Align section headings more tightly to the hero promise so the page builds one clear argument instead of shifting topics.",
      businessImpact: "medium",
    });
  }

  return drafts;
};
