import type { SpecialistEvaluator, SpecialistFindingDraft } from "./types";

export const evaluateTrustSignals: SpecialistEvaluator = ({ snapshot, metrics }) => {
  const drafts: SpecialistFindingDraft[] = [];
  const trustKeyPages: typeof snapshot.pageType[] = ["homepage", "services", "contact"];
  const isTrustPage = trustKeyPages.includes(snapshot.pageType);

  if (!isTrustPage) {
    return drafts;
  }

  if (metrics.trustSignals.density <= 1) {
    drafts.push({
      category: "trust_signals",
      issueType: "low_trust_signal_density",
      title: "Low trust signal density on key conversion page",
      description:
        "The captured page shows at most one trust indicator across proof, reassurance, and contact cues. Visitors on key pages typically need multiple credibility signals to proceed.",
      severity: snapshot.pageType === "contact" ? "high" : "medium",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["trust_signals", "contact_reassurance"],
      recommendation:
        "Add a fuller trust layer near the main action: credible proof, a reassurance cue, and a clear contact path.",
      businessImpact: "high",
    });
  }

  if (metrics.trustSignals.density >= 2 && metrics.trustSignals.proofPoints <= 1) {
    drafts.push({
      category: "trust_signals",
      issueType: "thin_social_proof_layer",
      title: "Some trust cues exist, but the proof layer still feels thin",
      description:
        "The captured page contains a few trust-related elements, but most are reassurance or contact cues rather than stronger proof such as testimonials, client logos, case studies, or certifications.",
      severity: "low",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["trust_signals", "contact_reassurance"],
      recommendation:
        "Strengthen the proof layer with concrete customer evidence, client logos, or case-study style outcomes close to the main CTA.",
      businessImpact: "medium",
    });
  }

  if (metrics.trustSignals.contactOptions === 0) {
    drafts.push({
      category: "trust_signals",
      issueType: "weak_contact_clarity",
      title: "Contact clarity is weak where reassurance should be strongest",
      description:
        "The captured page does not surface a clear phone, email, address, or obvious contact route. That makes the business feel harder to verify at the point of evaluation.",
      severity: snapshot.pageType === "contact" ? "high" : "medium",
      confidence: "high",
      evidenceLevel: "Observed",
      evidenceKeys: ["contact_reassurance", "trust_signals"],
      recommendation:
        "Expose at least one direct contact method and make the contact route obvious near the page's primary action.",
      businessImpact: "high",
    });
  }

  if (
    (snapshot.pageType === "contact" || metrics.formPresent) &&
    metrics.trustSignals.reassuranceSignals === 0
  ) {
    drafts.push({
      category: "trust_signals",
      issueType: "missing_reassurance_near_conversion",
      title: "Reassurance is thin around the main conversion step",
      description:
        "The captured page shows little legal or reassurance language near a high-intent page or form. That can slow submissions when visitors are deciding whether to trust the next step.",
      severity: "low",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["contact_reassurance", "trust_signals"],
      recommendation:
        "Add concise reassurance near the primary conversion point, such as privacy language, response expectations, or a simple guarantee.",
      businessImpact: "medium",
    });
  }

  return drafts;
};
