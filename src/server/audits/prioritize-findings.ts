import type { EvidenceLabel, Finding, FindingConfidence, FindingSeverity } from "@/lib/types";

type PrioritizableFinding = Pick<
  Finding,
  "category" | "title" | "severity" | "confidence" | "evidenceLevel" | "evidenceRef"
>;

const SEVERITY_PRIORITY: Record<FindingSeverity, number> = {
  critical: 120,
  high: 92,
  medium: 62,
  low: 30,
  info: 10,
};

const CONFIDENCE_PRIORITY: Record<FindingConfidence, number> = {
  high: 18,
  medium: 10,
  low: 4,
};

const EVIDENCE_PRIORITY: Record<EvidenceLabel, number> = {
  Measured: 18,
  Observed: 11,
  Inferred: 3,
};

const CATEGORY_IMPACT_PRIORITY: Record<Finding["category"], number> = {
  conversion: 22,
  trust_signals: 19,
  messaging_content: 18,
  ux_ui: 16,
  mobile_experience: 16,
  performance: 13,
  accessibility: 12,
  technical_seo: 10,
};

const BUSINESS_IMPACT_PRIORITY = {
  high: 20,
  medium: 10,
  low: 4,
} as const;

const PAGE_TYPE_PRIORITY = {
  homepage: 18,
  pricing: 16,
  product: 14,
  services: 12,
  contact: 12,
  form: 11,
  content: 6,
  about: 4,
  legal: 2,
  other: 2,
} as const;

const THEME_PRIORITY = {
  homepage_clarity: 18,
  conversion_path: 18,
  trust_layer: 17,
  mobile_friction: 15,
  ux_flow: 14,
  performance_risk: 12,
  accessibility: 11,
  technical_hygiene: 9,
} as const;

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/^homepage-only audit:\s*/i, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getIssueType(finding: PrioritizableFinding) {
  const explicitIssueType = typeof finding.evidenceRef.issueType === "string"
    ? normalizeText(finding.evidenceRef.issueType)
    : "";

  return explicitIssueType.replace(/\s+/g, "_");
}

function getBusinessImpact(
  finding: PrioritizableFinding
): keyof typeof BUSINESS_IMPACT_PRIORITY {
  const impact = (finding.evidenceRef.businessImpact as string | undefined)?.toLowerCase();

  if (impact === "high" || impact === "medium" || impact === "low") {
    return impact;
  }

  if (
    finding.category === "conversion" ||
    finding.category === "trust_signals" ||
    finding.category === "messaging_content"
  ) {
    return "high";
  }

  if (
    finding.category === "mobile_experience" ||
    finding.category === "ux_ui" ||
    finding.category === "accessibility"
  ) {
    return "medium";
  }

  return "low";
}

function getPageSpread(finding: PrioritizableFinding) {
  const pageUrls = Array.isArray(finding.evidenceRef.pageUrls)
    ? finding.evidenceRef.pageUrls
    : [];

  const explicitCount =
    typeof finding.evidenceRef.pageCount === "number" ? finding.evidenceRef.pageCount : 0;

  return Math.max(explicitCount, pageUrls.length, finding.evidenceRef.pageUrl ? 1 : 0);
}

function getPageTypes(finding: PrioritizableFinding) {
  const types = [
    ...(Array.isArray(finding.evidenceRef.pageTypes) ? finding.evidenceRef.pageTypes : []),
    typeof finding.evidenceRef.pageType === "string" ? finding.evidenceRef.pageType : "",
  ]
    .filter((pageType): pageType is string => Boolean(pageType))
    .filter((pageType): pageType is keyof typeof PAGE_TYPE_PRIORITY => pageType in PAGE_TYPE_PRIORITY);

  return [...new Set(types)];
}

function getEvidenceBreadth(finding: PrioritizableFinding) {
  const evidenceKeys = Array.isArray(finding.evidenceRef.evidenceKeys)
    ? finding.evidenceRef.evidenceKeys
    : [];

  return Math.min(evidenceKeys.length, 5);
}

function getNarrativeTheme(finding: PrioritizableFinding): keyof typeof THEME_PRIORITY {
  const issueType = getIssueType(finding);
  const pageTypes = getPageTypes(finding);
  const touchesHomepage = pageTypes.includes("homepage");

  if (
    [
      "weak_value_proposition",
      "offer_sprawl",
      "headline_section_mismatch",
      "generic_hero_messaging",
    ].includes(issueType)
  ) {
    return "homepage_clarity";
  }

  if (
    [
      "weak_next_step_conversion_path",
      "competing_cta_hierarchy",
      "cta_overload",
      "repeated_cta_labels",
      "long_form_friction",
      "form_usability_friction",
      "high_friction_only_path",
    ].includes(issueType)
  ) {
    return "conversion_path";
  }

  if (
    [
      "low_trust_signal_density",
      "thin_social_proof_layer",
      "weak_contact_clarity",
      "missing_reassurance_near_conversion",
    ].includes(issueType)
  ) {
    return "trust_layer";
  }

  if (
    [
      "dense_mobile_intro",
      "mobile_form_burden",
      "stacked_section_heaviness",
      "missing_viewport_meta",
    ].includes(issueType)
  ) {
    return "mobile_friction";
  }

  if (
    [
      "weak_section_hierarchy",
      "conversion_area_overload",
      "homepage_flow_coherence",
    ].includes(issueType)
  ) {
    return "ux_flow";
  }

  if (
    [
      "heavy_script_loading",
      "heavy_asset_mix",
      "complex_render_path",
    ].includes(issueType)
  ) {
    return "performance_risk";
  }

  if (finding.category === "accessibility") {
    return "accessibility";
  }

  if (
    touchesHomepage &&
    (finding.category === "messaging_content" ||
      finding.category === "conversion" ||
      finding.category === "trust_signals")
  ) {
    return "homepage_clarity";
  }

  return "technical_hygiene";
}

export function getPriorityScore(finding: PrioritizableFinding) {
  const pageSpread = getPageSpread(finding);
  const businessImpact = getBusinessImpact(finding);
  const pageTypes = getPageTypes(finding);
  const pageTypePriority =
    pageTypes.length > 0
      ? Math.max(...pageTypes.map((pageType) => PAGE_TYPE_PRIORITY[pageType] ?? 0))
      : 0;
  const theme = getNarrativeTheme(finding);

  return (
    SEVERITY_PRIORITY[finding.severity] +
    CONFIDENCE_PRIORITY[finding.confidence] +
    EVIDENCE_PRIORITY[finding.evidenceLevel] +
    CATEGORY_IMPACT_PRIORITY[finding.category] +
    BUSINESS_IMPACT_PRIORITY[businessImpact] +
    THEME_PRIORITY[theme] +
    pageTypePriority +
    Math.min(pageSpread, 5) * 4 +
    getEvidenceBreadth(finding) * 3
  );
}

function compareFindings(left: PrioritizableFinding, right: PrioritizableFinding) {
  const scoreDelta = getPriorityScore(right) - getPriorityScore(left);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  const categoryDelta = left.category.localeCompare(right.category);
  if (categoryDelta !== 0) {
    return categoryDelta;
  }

  return normalizeText(left.title).localeCompare(normalizeText(right.title));
}

export function prioritizeFindings<T extends PrioritizableFinding>(findings: T[]): T[] {
  return [...findings].sort(compareFindings);
}

export function selectTopPriorityFindings<T extends PrioritizableFinding>(
  findings: T[],
  limit = 5
): T[] {
  const remaining = prioritizeFindings(findings);
  const selected: T[] = [];
  const themeCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();

  while (remaining.length > 0 && selected.length < limit) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const [index, finding] of remaining.entries()) {
      const theme = getNarrativeTheme(finding);
      const diversityPenalty =
        (themeCounts.get(theme) ?? 0) * 18 + (categoryCounts.get(finding.category) ?? 0) * 10;
      const adjustedScore = getPriorityScore(finding) - diversityPenalty;

      if (adjustedScore > bestScore) {
        bestScore = adjustedScore;
        bestIndex = index;
      }
    }

    const [nextFinding] = remaining.splice(bestIndex, 1);
    selected.push(nextFinding);

    const theme = getNarrativeTheme(nextFinding);
    themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
    categoryCounts.set(
      nextFinding.category,
      (categoryCounts.get(nextFinding.category) ?? 0) + 1
    );
  }

  return selected;
}
