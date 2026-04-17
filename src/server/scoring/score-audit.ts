import type { Finding, Scorecard } from "@/lib/types";

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

// TODO: replace with rubric-driven scoring once rubric entities are in DB (Shot 2+)
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
