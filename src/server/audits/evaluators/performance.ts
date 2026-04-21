import type { SpecialistEvaluator, SpecialistFindingDraft } from "./types";

export const evaluatePerformance: SpecialistEvaluator = ({ metrics }) => {
  const drafts: SpecialistFindingDraft[] = [];

  if (metrics.scriptCount > 12 || metrics.assetWeight.thirdPartyScriptCount >= 4) {
    drafts.push({
      category: "performance",
      issueType: "heavy_script_loading",
      title: "Heavy script loading may delay page responsiveness",
      description:
        metrics.assetWeight.thirdPartyScriptCount >= 4
          ? `The captured HTML includes ${metrics.scriptCount} script elements, with ${metrics.assetWeight.thirdPartyScriptCount} loading from third-party origins. That is a strong signal that the page is carrying more client-side work than it likely needs.`
          : `The captured HTML includes ${metrics.scriptCount} script elements. That is a strong signal that the page may be asking the browser to do more work than necessary, especially on mobile connections.`,
      severity: metrics.scriptCount > 20 ? "medium" : "low",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceKeys: ["script_count", "asset_weight"],
      recommendation:
        "Reduce third-party tags, defer non-critical scripts, and set a tighter script budget for the page.",
      businessImpact: "medium",
    });
  }

  if (
    metrics.assetWeight.stylesheetCount >= 5 ||
    metrics.assetWeight.eagerImageCount >= 10 ||
    metrics.assetWeight.imageCount >= 18
  ) {
    drafts.push({
      category: "performance",
      issueType: "heavy_asset_mix",
      title: "The page asset mix is likely to slow initial rendering",
      description:
        `The captured page carries ${metrics.assetWeight.stylesheetCount} stylesheet references, ${metrics.assetWeight.imageCount} images, and ${metrics.assetWeight.eagerImageCount} images without lazy-loading hints. That asset mix points to a heavier first render, especially on mobile.`,
      severity:
        metrics.assetWeight.imageCount >= 24 || metrics.assetWeight.eagerImageCount >= 14
          ? "medium"
          : "low",
      confidence: "medium",
      evidenceLevel: "Measured",
      evidenceKeys: ["asset_weight", "page_complexity"],
      recommendation:
        "Trim decorative assets, lazy-load non-critical images, and tighten the CSS and image budget for the page.",
      businessImpact: "medium",
    });
  }

  if (
    metrics.pageStructure.domElementCount >= 650 ||
    (metrics.pageStructure.sectionCount >= 8 && metrics.buttonCount >= 8)
  ) {
    drafts.push({
      category: "performance",
      issueType: "complex_render_path",
      title: "Page complexity is likely to create rendering overhead",
      description:
        `The captured DOM contains roughly ${metrics.pageStructure.domElementCount} elements across ${metrics.pageStructure.sectionCount} sections. That level of complexity increases the amount of layout and paint work the browser may need to do, even though Core Web Vitals were not directly measured in this audit.`,
      severity: "low",
      confidence: "medium",
      evidenceLevel: "Measured",
      evidenceKeys: ["page_complexity", "asset_weight"],
      recommendation:
        "Simplify dense sections, remove unnecessary wrappers, and keep interactive regions lighter so the page has less work to render.",
      businessImpact: "medium",
    });
  }

  return drafts;
};
