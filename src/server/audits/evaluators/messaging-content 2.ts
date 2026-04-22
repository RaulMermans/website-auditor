import type { SpecialistEvaluator, SpecialistFindingDraft } from "./types";

export const evaluateMessagingContent: SpecialistEvaluator = ({ snapshot, metrics }) => {
  const drafts: SpecialistFindingDraft[] = [];

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

  if (snapshot.pageType === "homepage" && metrics.messagingQuality.genericIntroDetected) {
    drafts.push({
      category: "messaging_content",
      issueType: "generic_hero_messaging",
      title: "Generic hero messaging obscures value proposition",
      description:
        "The homepage hero text begins with a generic introductory phrase ('Welcome to', 'We are', 'Our company'). Generic intros waste the above-fold position that should state a clear, differentiated outcome for the visitor.",
      severity: "medium",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["messaging_quality"],
      recommendation:
        "Rewrite the hero opening to lead with the outcome or transformation the visitor gets, not a description of the business.",
      businessImpact: "high",
    });
  }

  return drafts;
};
