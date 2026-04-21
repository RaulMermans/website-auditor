import type { SpecialistEvaluator, SpecialistFindingDraft } from "./types";

export const evaluateUxUi: SpecialistEvaluator = ({ snapshot, metrics }) => {
  const drafts: SpecialistFindingDraft[] = [];
  const isStructureHeavyPage =
    snapshot.pageType === "homepage" ||
    snapshot.pageType === "services" ||
    snapshot.pageType === "contact";

  if (
    isStructureHeavyPage &&
    (metrics.pageStructure.duplicateHeadingCount >= 2 ||
      (metrics.pageStructure.sectionCount >= 8 &&
        metrics.pageStructure.longParagraphCount >= 4))
  ) {
    drafts.push({
      category: "ux_ui",
      issueType: "weak_section_hierarchy",
      title: "Section hierarchy is likely to create scan friction",
      description:
        metrics.pageStructure.duplicateHeadingCount >= 2
          ? "The captured page repeats section-heading patterns, which makes the layout feel templated and harder to scan with confidence."
          : `The captured page stacks ${metrics.pageStructure.sectionCount} sections and several long copy blocks. That combination weakens scan flow because each section competes for similar visual weight.`,
      severity: snapshot.pageType === "homepage" ? "medium" : "low",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["content_hierarchy", "heading_structure"],
      recommendation:
        "Tighten the section sequence so each block has a distinct purpose, shorter copy, and clearer hierarchy from one section to the next.",
      businessImpact: "medium",
    });
  }

  if (
    isStructureHeavyPage &&
    metrics.formPresent &&
    (metrics.pageStructure.denseIntroCtas >= 3 || metrics.pageStructure.denseIntroButtons >= 5)
  ) {
    drafts.push({
      category: "ux_ui",
      issueType: "conversion_area_overload",
      title: "The page is visually busy near conversion areas",
      description:
        `The captured page combines a form or conversion block with ${metrics.pageStructure.denseIntroCtas} CTA cues and ${metrics.pageStructure.denseIntroButtons} button-like elements near the top of the layout. That often creates a noisy decision point.`,
      severity: "medium",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["conversion_area_clutter", "content_hierarchy"],
      recommendation:
        "Reduce competing elements around the main conversion area so the layout reinforces one clear action instead of several distractions.",
      businessImpact: "high",
    });
  }

  if (
    snapshot.pageType === "homepage" &&
    metrics.pageStructure.sectionCount >= 8 &&
    (metrics.ctaInventory.count >= 5 || metrics.trustSignals.density <= 2)
  ) {
    drafts.push({
      category: "ux_ui",
      issueType: "homepage_flow_coherence",
      title: "Homepage flow feels busy before the core story settles",
      description:
        `The captured homepage moves through ${metrics.pageStructure.sectionCount} sections while also carrying ${metrics.ctaInventory.count} CTA cues and a limited trust layer. That combination can make the page feel busier than it feels guided.`,
      severity: "medium",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["content_hierarchy", "conversion_area_clutter", "trust_signals"],
      recommendation:
        "Rebuild the homepage flow around a simpler sequence: clear value proposition, proof, offer detail, and one main conversion action.",
      businessImpact: "high",
    });
  }

  return drafts;
};
