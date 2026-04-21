import type { SpecialistEvaluator } from "./types";

export const evaluateAccessibility: SpecialistEvaluator = ({ metrics }) => {
  if (!(metrics.imageCount > 0 && metrics.missingAltCount > 0)) {
    return [];
  }

  return [
    {
      category: "accessibility",
      issueType: "images_missing_alt_text",
      title: "Images missing alt text",
      description:
        "The captured HTML includes image elements without usable alt attributes, which reduces screen-reader context and fallback text quality.",
      severity:
        metrics.missingAltCount >= 3 || metrics.missingAltCount === metrics.imageCount
          ? "high"
          : "medium",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceKeys: ["image_count", "missing_alt_count"],
      recommendation: "Add meaningful alt text for informative images and empty alt text only for decorative ones.",
      businessImpact: "medium",
    },
  ];
};
