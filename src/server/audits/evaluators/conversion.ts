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
      title: "Weak next-step conversion path on captured page",
      description:
        "Based on the captured DOM, the page may not present a clear next step because no standard CTA/button heuristic or form was detected.",
      severity: snapshot.pageType === "contact" ? "high" : "medium",
      confidence: "medium",
      evidenceLevel: "Inferred",
      evidenceKeys: ["cta_present", "form_present", "button_count"],
      recommendation:
        "Add one clear next-step action for this page, such as a contact CTA, booking path, or request form.",
      businessImpact: "high",
    });
  }

  if (isKeyConversionPage && hasMultipleDistinctCtas) {
    drafts.push({
      category: "conversion",
      issueType: "competing_cta_hierarchy",
      title: "Primary and secondary actions compete for attention",
      description:
        `The captured page exposes ${metrics.ctaInventory.count} CTA-pattern elements across ${metrics.ctaInventory.uniqueCount} distinct labels. That spread makes it harder to tell which action is primary versus secondary.`,
      severity:
        snapshot.pageType === "homepage" || snapshot.pageType === "contact"
          ? "medium"
          : "low",
      confidence: "high",
      evidenceLevel: "Observed",
      evidenceKeys: ["cta_inventory", "conversion_path"],
      recommendation:
        "Choose one primary action for this page and demote the rest to secondary or contextual links.",
      businessImpact: "high",
    });
  }

  if (metrics.ctaInventory.hasDuplicates && metrics.ctaInventory.count >= 3) {
    drafts.push({
      category: "conversion",
      issueType: "repeated_cta_labels",
      title: "Repeated CTA labels may reduce conversion clarity",
      description:
        metrics.trustSignals.density <= 2
          ? "Three or more CTAs on the captured page share the same label text, but the surrounding page shows only a thin trust layer. Repeating the same CTA without stronger framing can feel pushy instead of persuasive."
          : "Three or more CTAs on the captured page share the same label text. Identical CTA labels spread across different sections signal repetition without hierarchy, which can reduce click-through focus.",
      severity: metrics.trustSignals.density <= 2 ? "medium" : "low",
      confidence: "high",
      evidenceLevel: "Observed",
      evidenceKeys: ["cta_inventory", "trust_signals"],
      recommendation:
        "Differentiate CTA labels by context (for example, 'Book a call' vs 'See pricing') so each action has a distinct purpose.",
      businessImpact: "medium",
    });
  }

  if (metrics.ctaInventory.count > 6) {
    drafts.push({
      category: "conversion",
      issueType: "cta_overload",
      title: "CTA overload may dilute primary conversion focus",
      description:
        `The captured page contains ${metrics.ctaInventory.count} CTA-pattern elements. Overloading a page with competing calls-to-action fragments visitor attention and weakens the primary conversion path.`,
      severity: hasMultipleDistinctCtas ? "medium" : "low",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["cta_inventory", "conversion_path"],
      recommendation:
        "Identify the single highest-value action for this page and reduce secondary CTAs to supporting roles.",
      businessImpact: "medium",
    });
  }

  if (metrics.formPresent && metrics.formFriction.fieldCount > 6) {
    drafts.push({
      category: "conversion",
      issueType: "long_form_friction",
      title: "Long form may create conversion friction",
      description:
        `The captured form contains ${metrics.formFriction.fieldCount} visible input fields. Forms with more than 6 fields have measurably higher abandonment rates, especially for first-contact pages.`,
      severity: "medium",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["form_friction", "form_present", "conversion_path"],
      recommendation:
        "Reduce the form to the minimum fields needed for the first step. Move additional qualification questions to a follow-up.",
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
      title: "The primary form adds friction before the first conversion step",
      description:
        !metrics.formFriction.hasLabels
          ? "The captured form includes fields without matching label elements. On lead forms, unlabeled inputs increase hesitation and slow completion."
          : `The captured form marks ${metrics.formFriction.requiredCount} fields as required. That is a heavy first-step ask for visitors who have not committed yet.`,
      severity: snapshot.pageType === "contact" ? "medium" : "low",
      confidence: "high",
      evidenceLevel: "Observed",
      evidenceKeys: ["form_friction", "conversion_path"],
      recommendation:
        "Trim the first-step form to the minimum required fields and make every input clearly labeled.",
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
      title: "The page leans on a high-friction conversion path",
      description:
        `The captured page appears to rely on a ${metrics.formFriction.fieldCount}-field form as the main next step, with little evidence of a lower-friction alternative such as a simple contact CTA or booking link.`,
      severity: snapshot.pageType === "contact" ? "high" : "medium",
      confidence: "medium",
      evidenceLevel: "Inferred",
      evidenceKeys: ["form_friction", "cta_inventory", "conversion_path"],
      recommendation:
        "Pair the longer form with a lower-friction action such as a short contact CTA, booking link, or email option.",
      businessImpact: "high",
    });
  }

  return drafts;
};
