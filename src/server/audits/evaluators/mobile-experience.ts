import type { SpecialistEvaluator } from "./types";

export const evaluateMobileExperience: SpecialistEvaluator = ({ metrics }) => {
  if (metrics.viewportMetaPresent) {
    return [];
  }

  return [
    {
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
    },
  ];
};
