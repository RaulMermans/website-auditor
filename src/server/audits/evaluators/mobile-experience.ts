import type { SpecialistEvaluator, SpecialistFindingDraft } from "./types";

export const evaluateMobileExperience: SpecialistEvaluator = ({ snapshot, metrics }) => {
  const drafts: SpecialistFindingDraft[] = [];
  const isKeyPage =
    snapshot.pageType === "homepage" ||
    snapshot.pageType === "services" ||
    snapshot.pageType === "contact";

  if (!metrics.viewportMetaPresent) {
    drafts.push({
      category: "mobile_experience",
      issueType: "missing_viewport_meta",
      title: "Missing viewport meta tag",
      description:
        "The captured HTML does not include a viewport meta tag, which removes a standard mobile scaling instruction from the page.",
      severity: "high",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceKeys: ["viewport_meta_present"],
      recommendation: "Add a standard viewport meta tag so mobile browsers scale the page correctly.",
      businessImpact: "high",
    });
  }

  if (
    isKeyPage &&
    (metrics.pageStructure.denseIntroCtas >= 3 ||
      metrics.pageStructure.denseIntroButtons >= 5 ||
      (metrics.messagingQuality.heroWordCount >= 18 &&
        metrics.pageStructure.denseIntroHeadings >= 4))
  ) {
    drafts.push({
      category: "mobile_experience",
      issueType: "dense_mobile_intro",
      title: "The opening section is likely to feel dense on mobile",
      description:
        `The captured top of page packs ${metrics.pageStructure.denseIntroHeadings} headings, ${metrics.pageStructure.denseIntroButtons} button-like elements, and ${metrics.pageStructure.denseIntroCtas} CTA cues into the opening layout. On small screens that often translates into a crowded first scroll.`,
      severity: "medium",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["mobile_layout", "messaging_quality", "cta_inventory"],
      recommendation:
        "Simplify the opening mobile experience around one clear message and one primary action before stacking additional elements.",
      businessImpact: "high",
    });
  }

  if (
    metrics.formPresent &&
    (metrics.formFriction.fieldCount > 5 ||
      metrics.formFriction.requiredCount >= 4 ||
      !metrics.formFriction.hasLabels)
  ) {
    drafts.push({
      category: "mobile_experience",
      issueType: "mobile_form_burden",
      title: "The current form is likely to feel heavy on small screens",
      description:
        !metrics.formFriction.hasLabels
          ? "The captured form relies on unlabeled fields, which is especially punishing on mobile where users cannot scan field context as easily."
          : `The captured form asks for ${metrics.formFriction.fieldCount} fields with ${metrics.formFriction.requiredCount} required. That is a heavy mobile first step for a small-screen visitor.`,
      severity: snapshot.pageType === "contact" ? "high" : "medium",
      confidence: "high",
      evidenceLevel: "Observed",
      evidenceKeys: ["mobile_layout", "form_friction"],
      recommendation:
        "Reduce the first-step form on mobile, keep labels visible, and defer secondary questions until after the initial contact action.",
      businessImpact: "high",
    });
  }

  if (
    isKeyPage &&
    metrics.pageStructure.sectionCount >= 8 &&
    metrics.pageStructure.longParagraphCount >= 4
  ) {
    drafts.push({
      category: "mobile_experience",
      issueType: "stacked_section_heaviness",
      title: "The page is likely to feel long and heavy on mobile",
      description:
        `The captured page stacks ${metrics.pageStructure.sectionCount} sections and several long copy blocks. Even without measured mobile timings, that structure is a strong clue that the page demands a long, dense scroll on smaller devices.`,
      severity: "low",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["mobile_layout", "content_hierarchy"],
      recommendation:
        "Shorten stacked sections, tighten copy blocks, and collapse secondary content so the mobile path reaches key proof and conversion points sooner.",
      businessImpact: "medium",
    });
  }

  return drafts;
};
