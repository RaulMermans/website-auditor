import type { EvidenceLabel, Finding, FindingCategory, FindingConfidence, Scorecard } from "@/lib/types";

const SEVERITY_WEIGHT: Record<Finding["severity"], number> = {
  critical: 18,
  high: 12,
  medium: 7,
  low: 3,
  info: 1,
};

const CONFIDENCE_MULTIPLIER: Record<FindingConfidence, number> = {
  high: 1,
  medium: 0.8,
  low: 0.6,
};

const EVIDENCE_MULTIPLIER: Record<EvidenceLabel, number> = {
  Measured: 1,
  Observed: 0.9,
  Inferred: 0.75,
};

const MAX_SCORE = 95;
const MIN_LIGHT_INSPECTION_SCORE = 70;

export interface ScoreAuditInput {
  auditRunId: string;
  rubricId: string;
  findings: Array<
    Pick<Finding, "id" | "severity"> &
      Partial<Pick<Finding, "confidence" | "evidenceLevel">>
  >;
}

export const ALL_FINDING_CATEGORIES: FindingCategory[] = [
  "performance",
  "technical_seo",
  "accessibility",
  "ux_ui",
  "messaging_content",
  "conversion",
  "trust_signals",
  "mobile_experience",
];

export const CATEGORY_EXPECTED_KEYS: Record<FindingCategory, string[]> = {
  performance: ["script_count"],
  technical_seo: [
    "title",
    "meta_description",
    "h1_count",
    "internal_link_count",
    "external_link_count",
    "canonical_present",
    "robots_meta",
    "heading_structure",
  ],
  accessibility: ["image_count", "missing_alt_count"],
  ux_ui: [],
  messaging_content: ["page_text_flags", "messaging_quality"],
  conversion: ["form_present", "cta_present", "button_count", "cta_inventory", "form_friction"],
  trust_signals: ["trust_signals"],
  mobile_experience: ["viewport_meta_present"],
};

export interface InspectionSummary {
  status: "not_inspected" | "lightly_inspected" | "inspected";
  depth: number;
  observedKeys: string[];
  expectedKeys: string[];
}

export interface CategoryScores {
  overall: number;
  byCategory: Record<FindingCategory, number>;
  inspectedCategories?: FindingCategory[];
  inspectionSummaryByCategory: Record<FindingCategory, InspectionSummary>;
}

export interface ScoreAuditByCategoryOptions {
  inspectionKeysByCategory?: Partial<Record<FindingCategory, string[]>>;
}

function clampScore(score: number) {
  return Math.max(0, Math.min(MAX_SCORE, Math.round(score)));
}

function normalizeInspectionKeys(keys: string[]) {
  return [...new Set(keys.map((key) => key.trim().toLowerCase()).filter(Boolean))];
}

function getFindingPenalty(
  finding: Pick<Finding, "severity"> &
    Partial<Pick<Finding, "confidence" | "evidenceLevel">>
) {
  const confidence = finding.confidence ?? "medium";
  const evidenceLevel = finding.evidenceLevel ?? "Observed";

  return (
    SEVERITY_WEIGHT[finding.severity] *
    CONFIDENCE_MULTIPLIER[confidence] *
    EVIDENCE_MULTIPLIER[evidenceLevel]
  );
}

function resolveInspectionSummary(
  category: FindingCategory,
  options?: ScoreAuditByCategoryOptions
): InspectionSummary {
  const expectedKeys = CATEGORY_EXPECTED_KEYS[category];

  if (expectedKeys.length === 0) {
    return {
      status: "not_inspected",
      depth: 0,
      observedKeys: [],
      expectedKeys,
    };
  }

  const providedKeys = options?.inspectionKeysByCategory
    ? options.inspectionKeysByCategory[category] ?? []
    : expectedKeys;

  const observedKeys = normalizeInspectionKeys(providedKeys).filter((key) => expectedKeys.includes(key));
  const depth = expectedKeys.length === 0 ? 0 : observedKeys.length / expectedKeys.length;

  if (depth === 0) {
    return {
      status: "not_inspected",
      depth,
      observedKeys,
      expectedKeys,
    };
  }

  return {
    status: depth < 0.7 ? "lightly_inspected" : "inspected",
    depth,
    observedKeys,
    expectedKeys,
  };
}

function getInspectionCeiling(summary: InspectionSummary) {
  if (summary.status === "not_inspected") {
    return 0;
  }

  return MIN_LIGHT_INSPECTION_SCORE + summary.depth * (MAX_SCORE - MIN_LIGHT_INSPECTION_SCORE);
}

export function scoreAuditByCategory(
  findings: Array<
    Pick<Finding, "id" | "severity" | "category"> &
      Partial<Pick<Finding, "confidence" | "evidenceLevel">>
  >,
  options: ScoreAuditByCategoryOptions = {}
): CategoryScores {
  const inspectionSummaryByCategory = Object.fromEntries(
    ALL_FINDING_CATEGORIES.map((category) => [category, resolveInspectionSummary(category, options)])
  ) as Record<FindingCategory, InspectionSummary>;

  const byCategory = Object.fromEntries(
    ALL_FINDING_CATEGORIES.map((category) => {
      const inspectionSummary = inspectionSummaryByCategory[category];
      const categoryPenalty = findings
        .filter((finding) => finding.category === category)
        .reduce((sum, finding) => sum + getFindingPenalty(finding), 0);

      if (inspectionSummary.status === "not_inspected") {
        return [category, 0];
      }

      return [category, clampScore(getInspectionCeiling(inspectionSummary) - categoryPenalty)];
    })
  ) as Record<FindingCategory, number>;

  const inspectableCategories = ALL_FINDING_CATEGORIES.filter(
    (category) => CATEGORY_EXPECTED_KEYS[category].length > 0
  );
  const inspectedCategories = ALL_FINDING_CATEGORIES.filter(
    (category) => inspectionSummaryByCategory[category].status !== "not_inspected"
  );
  const inspectedScores = inspectableCategories
    .filter((category) => inspectionSummaryByCategory[category].status !== "not_inspected")
    .map((category) => byCategory[category]);
  const coveragePenalty =
    inspectableCategories.length === 0
      ? 0
      : ((inspectableCategories.length - inspectedScores.length) / inspectableCategories.length) * 10;
  const inspectedAverage =
    inspectedScores.length > 0
      ? inspectedScores.reduce((sum, score) => sum + score, 0) / inspectedScores.length
      : 0;

  return {
    overall: clampScore(inspectedAverage - coveragePenalty),
    byCategory,
    inspectedCategories,
    inspectionSummaryByCategory,
  };
}

export function scoreAudit(input: ScoreAuditInput): Omit<Scorecard, "id" | "computedAt"> {
  const penalty = input.findings.reduce((sum, finding) => sum + getFindingPenalty(finding), 0);
  const totalScore = clampScore(MAX_SCORE - penalty);

  return {
    auditRunId: input.auditRunId,
    rubricId: input.rubricId,
    scores: { overall: totalScore },
    totalScore,
  };
}
