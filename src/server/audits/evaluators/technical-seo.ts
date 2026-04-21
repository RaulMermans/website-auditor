import type { SpecialistEvaluator, SpecialistFindingDraft } from "./types";

export const evaluateTechnicalSeo: SpecialistEvaluator = ({ metrics }) => {
  const drafts: SpecialistFindingDraft[] = [];

  if (!metrics.title.present) {
    drafts.push({
      category: "technical_seo",
      issueType: "missing_title",
      title: "Missing page title",
      description:
        "The captured HTML does not include a non-empty <title> tag, so the page lacks a basic search and browser label.",
      severity: "high",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceKeys: ["title"],
      recommendation: "Add a unique, descriptive <title> tag for this captured page.",
      businessImpact: "medium",
    });
  }

  if (!metrics.metaDescription.present) {
    drafts.push({
      category: "technical_seo",
      issueType: "missing_meta_description",
      title: "Missing meta description",
      description:
        "No meta description was detected in the captured HTML, which leaves search snippets and social previews without a curated summary.",
      severity: "medium",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceKeys: ["meta_description"],
      recommendation: "Add a concise meta description that matches the page intent and content.",
      businessImpact: "medium",
    });
  }

  if (!metrics.canonicalPresent) {
    drafts.push({
      category: "technical_seo",
      issueType: "missing_canonical",
      title: "Missing canonical tag",
      description:
        "The captured page does not expose a canonical link tag, so preferred indexing signals are missing from the stored snapshot.",
      severity: "medium",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceKeys: ["canonical_present"],
      recommendation: "Add a rel=canonical tag that points to the preferred public URL for this page.",
      businessImpact: "medium",
    });
  }

  if (metrics.robotsMeta.noindex) {
    drafts.push({
      category: "technical_seo",
      issueType: "robots_noindex",
      title: "Robots meta requests noindex",
      description:
        "The captured robots meta tag includes a noindex-style directive, which can remove this page from search results.",
      severity: "high",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceKeys: ["robots_meta"],
      recommendation: "Confirm the robots directive is intentional before shipping it on a public page.",
      businessImpact: "high",
    });
  }

  if (metrics.h1Count === 0) {
    drafts.push({
      category: "technical_seo",
      issueType: "missing_h1",
      title: "No H1 heading detected",
      description:
        "The stored HTML does not contain an H1 heading, so the page is missing its primary visible content label.",
      severity: "medium",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceKeys: ["h1_count", "heading_structure"],
      recommendation: "Add one clear H1 that matches the main topic of the captured page.",
      businessImpact: "medium",
    });
  }

  if (metrics.h1Count > 1) {
    drafts.push({
      category: "technical_seo",
      issueType: "multiple_h1",
      title: "Multiple H1 headings detected",
      description:
        "More than one H1 heading was found in the captured HTML, which can dilute the primary page hierarchy.",
      severity: "low",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceKeys: ["h1_count", "heading_structure"],
      recommendation: "Reduce the page to a single primary H1 and demote the remaining headings.",
      businessImpact: "low",
    });
  }

  if (metrics.headingStructure.hints.some((hint) => hint.startsWith("skipped_"))) {
    drafts.push({
      category: "technical_seo",
      issueType: "skipped_heading_levels",
      title: "Heading levels skip in the captured structure",
      description:
        "The stored heading outline jumps levels, which weakens the content hierarchy exposed in the captured DOM.",
      severity: "low",
      confidence: "medium",
      evidenceLevel: "Measured",
      evidenceKeys: ["heading_structure"],
      recommendation: "Tighten the heading order so sections move through levels without skipping.",
      businessImpact: "low",
    });
  }

  return drafts;
};
