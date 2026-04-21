import type { SpecialistEvaluator } from "./types";

export const evaluatePerformance: SpecialistEvaluator = ({ metrics }) => {
  if (metrics.scriptCount <= 15) {
    return [];
  }

  return [
    {
      category: "performance",
      issueType: "heavy_script_loading",
      title: "Heavy script loading may delay page responsiveness",
      description:
        `The captured HTML includes ${metrics.scriptCount} script elements. High script counts are a leading indicator of render-blocking load issues and slow Time to Interactive, particularly on mobile connections.`,
      severity: "low",
      confidence: "medium",
      evidenceLevel: "Measured",
      evidenceKeys: ["script_count"],
      recommendation:
        "Audit and defer non-critical scripts, consolidate third-party tags, and set a script budget to improve load performance.",
      businessImpact: "medium",
    },
  ];
};
