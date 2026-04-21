import type { SpecialistEvaluator, SpecialistFindingDraft } from "./types";

export const evaluateConversion: SpecialistEvaluator = ({ snapshot, metrics }) => {
  const drafts: SpecialistFindingDraft[] = [];

  if (!metrics.ctaPresent && !metrics.formPresent) {
    const shouldFlagConversion =
      snapshot.pageType === "homepage" ||
      snapshot.pageType === "services" ||
      snapshot.pageType === "contact" ||
      snapshot.pageType === "content";

    if (shouldFlagConversion) {
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
  }

  if (metrics.ctaInventory.hasDuplicates && metrics.ctaInventory.count >= 3) {
    drafts.push({
      category: "conversion",
      issueType: "repeated_cta_labels",
      title: "Repeated CTA labels may reduce conversion clarity",
      description:
        "Three or more CTAs on the captured page share the same label text. Identical CTA labels spread across different sections signal repetition without hierarchy, which can reduce click-through focus.",
      severity: "low",
      confidence: "high",
      evidenceLevel: "Observed",
      evidenceKeys: ["cta_inventory"],
      recommendation:
        "Differentiate CTA labels by context (e.g., 'Book a call' vs 'See pricing') so each action has a distinct purpose.",
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
      severity: "low",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["cta_inventory"],
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
      evidenceKeys: ["form_friction", "form_present"],
      recommendation:
        "Reduce the form to the minimum fields needed for the first step. Move additional qualification questions to a follow-up.",
      businessImpact: "high",
    });
  }

  return drafts;
};
