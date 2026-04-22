import type { SpecialistEvaluator } from "./types";

export const evaluateTrustSignals: SpecialistEvaluator = ({ snapshot, metrics }) => {
  const trustKeyPages: typeof snapshot.pageType[] = ["homepage", "services", "contact"];

  if (!trustKeyPages.includes(snapshot.pageType) || metrics.trustSignals.density > 1) {
    return [];
  }

  return [
    {
      category: "trust_signals",
      issueType: "low_trust_signal_density",
      title: "Low trust signal density on key conversion page",
      description:
        "The captured page shows at most one trust indicator (testimonials, social proof, logo block, guarantee, contact info, privacy link, or certifications). Visitors on key pages typically need multiple credibility signals to proceed.",
      severity: "medium",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceKeys: ["trust_signals"],
      recommendation:
        "Add at least 2-3 trust signals to this page: real customer testimonials, logo block of known clients, or a satisfaction guarantee.",
      businessImpact: "high",
    },
  ];
};
