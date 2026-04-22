import type { SpecialistEvaluator, SpecialistFindingDraft } from "./types";

export const evaluateConversion: SpecialistEvaluator = ({ snapshot, metrics }) => {
  const drafts: SpecialistFindingDraft[] = [];
  const isKeyConversionPage =
    snapshot.pageType === "homepage" ||
    snapshot.pageType === "services" ||
    snapshot.pageType === "contact" ||
    snapshot.pageType === "content";
  const hasMultipleDistinctCtas =
    metrics.ctaInventory.count >= 4 && metrics.ctaInventory.uniqueCount >= 3;

  if (!metrics.ctaPresent && !metrics.formPresent && isKeyConversionPage) {
    drafts.push({
      category: "conversion",
      issueType: "weak_next_step_conversion_path",
      title: "Primary next step is not yet clear on this page",
      description:
        "The captured DOM did not surface a standard CTA/button pattern or form. That suggests the page may not be giving visitors an obvious next step, although this remains a directional judgment rather than a measured conversion benchmark.",
      severity: snapshot.pageType === "contact" ? "high" : "medium",
      confidence: "medium",
      evidenceLevel: "Inferred",
      evidenceKeys: ["cta_present", "form_present", "button_count"],
      recommendation:
        "Add one obvious next-step action for this page, such as a contact CTA, booking route, or short request form.",
      businessImpact: "high",
    });
  }

  if (isKeyConversionPage && hasMultipleDistinctCtas) {
    drafts.push({
      category: "conversion",
      issueType: "competing_cta_hierarchy",
      title: "Primary action is not clearly distinguished from secondary actions",
      description:
        `The captured page exposes ${metrics.ctaInventory.count} CTA-pattern elements across ${metrics.ctaInventory.uniqueCount} distinct labels. That spread makes it harder to tell which action should lead the page and which ones are supporting options.`,
      severity:
        snapshot.pageType === "homepage" || snapshot.pageType === "contact"
          ? "medium"
          : "low",
      confidence: "high",
      evidenceLevel: "Observed",
      evidenceKeys: ["cta_inventory", "conversion_path"],
      recommendation:
        "Choose one primary action for the page and demote the rest to clearly secondary or contextual links.",
      businessImpact: "high",
    });
  }

  if (metrics.ctaInventory.hasDuplicates && metrics.ctaInventory.count >= 3) {
    drafts.push({
      category: "conversion",
      issueType: "repeated_cta_labels",
      title: "CTA language repeats without adding much context",
      description:
        metrics.trustSignals.density <= 2
          ? "Three or more CTAs on the captured page share the same label text, while the surrounding page shows only a thin trust layer. Repeating the same ask without stronger framing can read as repetitive rather than persuasive."
          : "Three or more CTAs on the captured page share the same label text. Repeating identical CTA language across different sections adds repetition without helping visitors understand the role of each action.",
      severity: metrics.trustSignals.density <= 2 ? "medium" : "low",
      confidence: "high",
      evidenceLevel: "Observed",
      evidenceKeys: ["cta_inventory", "trust_signals"],
      recommendation:
        "Differentiate CTA labels by context so each action signals a distinct purpose rather than repeating the same ask everywhere.",
      businessImpact: "medium",
    });
  }

  if (metrics.ctaInventory.count > 6) {
    drafts.push({
      category: "conversion",
      issueType: "cta_overload",
      title: "Too many calls to action compete for the same attention",
      description:
        `The captured page contains ${metrics.ctaInventory.count} CTA-pattern elements. That volume can scatter attention and weaken the page's primary conversion path.`,
      severity: hasMultipleDistinctCtas ? "medium" : "low",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["cta_inventory", "conversion_path"],
      recommendation:
        "Identify the single highest-value action for this page and reduce secondary CTAs to supporting roles around it.",
      businessImpact: "medium",
    });
  }

  if (metrics.formPresent && metrics.formFriction.fieldCount > 6) {
    drafts.push({
      category: "conversion",
      issueType: "long_form_friction",
      title: "The first-step form asks for more than it likely needs",
      description:
        `The captured form contains ${metrics.formFriction.fieldCount} visible input fields. That is a relatively heavy first-step ask for a cold visitor, especially on lead-generation pages.`,
      severity: "medium",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["form_friction", "form_present", "conversion_path"],
      recommendation:
        "Reduce the form to the minimum fields needed for the first step and move qualification questions to a follow-up.",
      businessImpact: "high",
    });
  }

  if (
    metrics.formPresent &&
    (!metrics.formFriction.hasLabels || metrics.formFriction.requiredCount >= 4)
  ) {
    drafts.push({
      category: "conversion",
      issueType: "form_usability_friction",
      title: "The first-step form adds avoidable completion friction",
      description:
        !metrics.formFriction.hasLabels
          ? "The captured form includes fields without matching label elements. On lead forms, unlabeled inputs make completion feel less certain and slower to process."
          : `The captured form marks ${metrics.formFriction.requiredCount} fields as required. That is a demanding first-step ask for visitors who have not committed yet.`,
      severity: snapshot.pageType === "contact" ? "medium" : "low",
      confidence: "high",
      evidenceLevel: "Observed",
      evidenceKeys: ["form_friction", "conversion_path"],
      recommendation:
        "Trim the first-step form to the minimum required fields and make every input explicitly labeled.",
      businessImpact: "high",
    });
  }

  if (
    isKeyConversionPage &&
    metrics.formPresent &&
    metrics.formFriction.fieldCount > 6 &&
    metrics.ctaInventory.count <= 1
  ) {
    drafts.push({
      category: "conversion",
      issueType: "high_friction_only_path",
      title: "The page appears to rely on a relatively high-friction next step",
      description:
        `The captured page appears to rely on a ${metrics.formFriction.fieldCount}-field form as the main next step, with little evidence of a lower-friction alternative such as a simple contact CTA or booking link. This is a directional risk call based on the captured structure.`,
      severity: snapshot.pageType === "contact" ? "high" : "medium",
      confidence: "medium",
      evidenceLevel: "Inferred",
      evidenceKeys: ["form_friction", "cta_inventory", "conversion_path"],
      recommendation:
        "Pair the longer form with a lower-friction path such as a short contact CTA, booking link, or direct email option.",
      businessImpact: "high",
    });
  }

  return drafts;
};
