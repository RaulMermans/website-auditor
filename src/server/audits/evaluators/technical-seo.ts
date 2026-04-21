import type { SpecialistEvaluator, SpecialistFindingDraft } from "./types";

export const evaluateTechnicalSeo: SpecialistEvaluator = ({ metrics }) => {
  const drafts: SpecialistFindingDraft[] = [];

  if (!metrics.title.present) {
    drafts.push({
      category: "technical_seo",
      issueType: "missing_title",
      title: "Missing page title",
      description:
        "The captured HTML does not include a non-empty <title> tag, so the page is missing one of its core search and browser labels.",
      severity: "high",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceKeys: ["title"],
      recommendation:
        "Write a unique <title> tag that states the page topic clearly and distinguishes it from the rest of the site.",
      businessImpact: "medium",
    });
  }

  if (!metrics.metaDescription.present) {
    drafts.push({
      category: "technical_seo",
      issueType: "missing_meta_description",
      title: "Missing meta description",
      description:
        "No meta description was detected in the captured HTML, so search snippets and preview surfaces are left without a controlled page summary.",
      severity: "medium",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceKeys: ["meta_description"],
      recommendation:
        "Add a concise meta description that explains the page offer and gives searchers a reason to click through.",
      businessImpact: "medium",
    });
  }

  if (!metrics.canonicalPresent) {
    drafts.push({
      category: "technical_seo",
      issueType: "missing_canonical",
      title: "Missing canonical tag",
      description:
        "The captured page does not expose a canonical link tag, so the preferred URL for indexing is not stated in the stored snapshot.",
      severity: "medium",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceKeys: ["canonical_present"],
      recommendation:
        "Publish a rel=canonical tag that points to the preferred live URL for this page so indexing signals consolidate cleanly.",
      businessImpact: "medium",
    });
  }

  if (metrics.robotsMeta.noindex) {
    drafts.push({
      category: "technical_seo",
      issueType: "robots_noindex",
      title: "Robots meta requests noindex",
      description:
        "The captured robots meta tag includes a noindex-style directive, which tells search engines not to keep this page in results.",
      severity: "high",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceKeys: ["robots_meta"],
      recommendation:
        "Confirm that the noindex directive is intentional and remove it from public acquisition pages if the page is meant to rank.",
      businessImpact: "high",
    });
  }

  if (metrics.h1Count === 0) {
    drafts.push({
      category: "technical_seo",
      issueType: "missing_h1",
      title: "No H1 heading detected",
      description:
        "The stored HTML does not contain an H1 heading, so the page is missing a clear primary on-page content label.",
      severity: "medium",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceKeys: ["h1_count", "heading_structure"],
      recommendation:
        "Add one visible H1 that states the page topic or offer and lines up with the page title and opening copy.",
      businessImpact: "medium",
    });
  }

  if (metrics.h1Count > 1) {
    drafts.push({
      category: "technical_seo",
      issueType: "multiple_h1",
      title: "Multiple H1 headings detected",
      description:
        "More than one H1 heading was found in the captured HTML, which weakens the page's primary content hierarchy.",
      severity: "low",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceKeys: ["h1_count", "heading_structure"],
      recommendation:
        "Keep one primary H1 and step the remaining headings down to H2/H3 so the content hierarchy reads cleanly.",
      businessImpact: "low",
    });
  }

  if (metrics.headingStructure.hints.some((hint) => hint.startsWith("skipped_"))) {
    drafts.push({
      category: "technical_seo",
      issueType: "skipped_heading_levels",
      title: "Heading levels skip in the captured structure",
      description:
        "The stored heading outline jumps levels, which makes the document hierarchy less orderly in the captured DOM.",
      severity: "low",
      confidence: "medium",
      evidenceLevel: "Measured",
      evidenceKeys: ["heading_structure"],
      recommendation:
        "Reorder headings so sections move through levels in sequence instead of jumping from one level to another.",
      businessImpact: "low",
    });
  }

  return drafts;
};
