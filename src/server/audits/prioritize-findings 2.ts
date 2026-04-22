import type { EvidenceLabel, Finding, FindingConfidence, FindingSeverity } from "@/lib/types";

type PrioritizableFinding = Pick<
  Finding,
  "category" | "title" | "severity" | "confidence" | "evidenceLevel" | "evidenceRef"
>;

const SEVERITY_PRIORITY: Record<FindingSeverity, number> = {
  critical: 120,
  high: 90,
  medium: 60,
  low: 30,
  info: 10,
};

const CONFIDENCE_PRIORITY: Record<FindingConfidence, number> = {
  high: 18,
  medium: 10,
  low: 4,
};

const EVIDENCE_PRIORITY: Record<EvidenceLabel, number> = {
  Measured: 14,
  Observed: 10,
  Inferred: 6,
};

const CATEGORY_IMPACT_PRIORITY: Record<Finding["category"], number> = {
  conversion: 20,
  trust_signals: 18,
  messaging_content: 16,
  mobile_experience: 15,
  accessibility: 14,
  performance: 12,
  technical_seo: 10,
  ux_ui: 8,
};

const BUSINESS_IMPACT_PRIORITY = {
  high: 18,
  medium: 10,
  low: 4,
} as const;

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/^homepage-only audit:\s*/i, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getBusinessImpact(
  finding: PrioritizableFinding
): keyof typeof BUSINESS_IMPACT_PRIORITY {
  const impact = (finding.evidenceRef.businessImpact as string | undefined)?.toLowerCase();

  if (impact === "high" || impact === "medium" || impact === "low") {
    return impact;
  }

  if (finding.category === "conversion" || finding.category === "trust_signals") {
    return "high";
  }

  if (
    finding.category === "messaging_content" ||
    finding.category === "mobile_experience" ||
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

export function getPriorityScore(finding: PrioritizableFinding) {
  const pageSpread = getPageSpread(finding);
  const businessImpact = getBusinessImpact(finding);

  return (
    SEVERITY_PRIORITY[finding.severity] +
    CONFIDENCE_PRIORITY[finding.confidence] +
    EVIDENCE_PRIORITY[finding.evidenceLevel] +
    CATEGORY_IMPACT_PRIORITY[finding.category] +
    BUSINESS_IMPACT_PRIORITY[businessImpact] +
    Math.min(pageSpread, 5) * 3
  );
}

export function prioritizeFindings<T extends PrioritizableFinding>(findings: T[]): T[] {
  return [...findings].sort((left, right) => {
    const scoreDelta = getPriorityScore(right) - getPriorityScore(left);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    const categoryDelta = left.category.localeCompare(right.category);
    if (categoryDelta !== 0) {
      return categoryDelta;
    }

    return normalizeText(left.title).localeCompare(normalizeText(right.title));
  });
}
