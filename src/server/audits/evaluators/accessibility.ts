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
        "The captured HTML includes image elements without usable alt attributes, so screen-reader users and broken-image states lose basic context that should be available on the page.",
      severity:
        metrics.missingAltCount >= 3 || metrics.missingAltCount === metrics.imageCount
          ? "high"
          : "medium",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceKeys: ["image_count", "missing_alt_count"],
      recommendation:
        "Write meaningful alt text for informative images and reserve empty alt attributes only for decorative assets.",
      businessImpact: "medium",
    },
  ];
};
