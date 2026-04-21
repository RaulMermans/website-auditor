import type { Finding, FindingCategory, Scorecard } from "@/lib/types";

// Severity weights — rule-based, deterministic inputs only.
const SEVERITY_WEIGHT: Record<Finding["severity"], number> = {
  critical: 20,
  high: 10,
  medium: 5,
  low: 2,
  info: 0,
};

const MAX_SCORE = 100;

export interface ScoreAuditInput {
  auditRunId: string;
  rubricId: string;
  findings: Pick<Finding, "id" | "severity">[];
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

export interface CategoryScores {
  overall: number;
  byCategory: Record<FindingCategory, number>;
  /** Categories where at least one evidence item was collected during the audit. Absent means all were inspected. */
  inspectedCategories?: FindingCategory[];
}

export function scoreAuditByCategory(
  findings: Pick<Finding, "id" | "severity" | "category">[],
  inspectedCategories?: FindingCategory[]
): CategoryScores {
  const overallPenalty = findings.reduce(
    (sum, f) => sum + (SEVERITY_WEIGHT[f.severity] ?? 0),
    0
  );

  const byCategory = Object.fromEntries(
    ALL_FINDING_CATEGORIES.map((cat) => {
      const catPenalty = findings
        .filter((f) => f.category === cat)
        .reduce((sum, f) => sum + (SEVERITY_WEIGHT[f.severity] ?? 0), 0);
      return [cat, Math.max(0, MAX_SCORE - catPenalty)];
    })
  ) as Record<FindingCategory, number>;

  return {
    overall: Math.max(0, MAX_SCORE - overallPenalty),
    byCategory,
    inspectedCategories: inspectedCategories ?? [...ALL_FINDING_CATEGORIES],
  };
}

export function scoreAudit(input: ScoreAuditInput): Omit<Scorecard, "id" | "computedAt"> {
  const penalty = input.findings.reduce(
    (sum, f) => sum + (SEVERITY_WEIGHT[f.severity] ?? 0),
    0
  );

  const totalScore = Math.max(0, MAX_SCORE - penalty);

  return {
    auditRunId: input.auditRunId,
    rubricId: input.rubricId,
    scores: { overall: totalScore },
    totalScore,
  };
}
