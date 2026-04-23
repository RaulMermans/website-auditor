import { withDbClient } from "@/db/client";
import type {
  AuditRun,
  AuditStatus,
  ClaimPosture,
  EvidenceLabel,
  Finding,
  FindingCategory,
  FindingConfidence,
  FindingEvaluatorStatus,
  FindingReviewStatus,
  FindingSeverity,
  FindingSupportType,
} from "@/lib/types";
import {
  ALL_FINDING_CATEGORIES,
  scoreAuditByCategory,
  type CategoryScores,
  type InspectionSummary,
} from "@/server/scoring/score-audit";
import {
  prioritizeFindings,
  selectTopPriorityFindings,
} from "@/server/audits/prioritize-findings";
import { deduplicateFindings } from "@/server/audits/deduplicate-findings";

interface AuditRunWithDomainRow {
  id: string;
  project_id: string | null;
  target_domain_id: string;
  status: AuditStatus;
  homepage_only: boolean;
  started_at: Date;
  completed_at: Date | null;
  failure_reason: string | null;
  created_at: Date;
  domain: string;
}

interface FindingRow {
  id: string;
  audit_run_id: string;
  page_snapshot_id: string;
  category: FindingCategory;
  title: string;
  description: string;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  evidence_level: EvidenceLabel;
  evidence_ref: Record<string, unknown>;
  claim_posture: ClaimPosture;
  support_type: FindingSupportType;
  evaluator_status: FindingEvaluatorStatus;
  evaluator_notes: string | null;
  recommendation: string;
  review_status: FindingReviewStatus;
  review_reason: string | null;
  created_at: Date;
}

export interface AuditRunListItem {
  auditRunId: string;
  domain: string;
  status: AuditStatus;
  createdAt: Date;
  completedAt: Date | null;
  homepageOnly: boolean;
  failureReason: string | null;
}

export interface ReportData {
  auditRunId: string;
  domain: string;
  auditRun: AuditRun;
  findings: Finding[];
  topPriorities: Finding[];
  scores: CategoryScores;
  categoryReviews: ReportCategoryReview[];
}

export interface ReportRepository {
  getReportData(auditRunId: string): Promise<ReportData | null>;
}

export interface ReportCategoryReview {
  category: FindingCategory;
  score: number | null;
  findingCount: number;
  findings: Finding[];
  inspectionStatus: InspectionSummary["status"];
  observedChecks: number;
  expectedChecks: number;
  reviewState:
    | "inspected_clean"
    | "inspected_with_findings"
    | "lightly_inspected"
    | "insufficient_evidence";
  headline: string;
  summary: string;
}

function mapAuditRun(row: AuditRunWithDomainRow): AuditRun {
  return {
    id: row.id,
    projectId: row.project_id,
    targetDomainId: row.target_domain_id,
    status: row.status,
    homepageOnly: row.homepage_only,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
  };
}

function mapFinding(row: FindingRow): Finding {
  return {
    id: row.id,
    auditRunId: row.audit_run_id,
    pageSnapshotId: row.page_snapshot_id,
    category: row.category,
    title: row.title,
    description: row.description,
    severity: row.severity,
    confidence: row.confidence,
    evidenceLevel: row.evidence_level,
    evidenceRef: row.evidence_ref,
    claimPosture: row.claim_posture,
    supportType: row.support_type,
    evaluatorStatus: row.evaluator_status,
    evaluatorNotes: row.evaluator_notes,
    recommendation: row.recommendation,
    reviewStatus: row.review_status,
    reviewReason: row.review_reason,
    createdAt: row.created_at,
  };
}

function buildCategoryReview(
  category: FindingCategory,
  findings: Finding[],
  scores: CategoryScores
): ReportCategoryReview {
  const inspection = scores.inspectionSummaryByCategory[category];
  const observedChecks = inspection.observedKeys.length;
  const expectedChecks = inspection.expectedKeys.length;

  if (inspection.status === "not_inspected") {
    return {
      category,
      score: null,
      findingCount: findings.length,
      findings,
      inspectionStatus: inspection.status,
      observedChecks,
      expectedChecks,
      reviewState: "insufficient_evidence",
      headline: "Insufficient evidence",
      summary:
        "This category sits outside meaningful deterministic coverage in the current pass. Absence of findings here should be read as unknown, not clean.",
    };
  }

  if (inspection.status === "lightly_inspected") {
    return {
      category,
      score: scores.byCategory[category],
      findingCount: findings.length,
      findings,
      inspectionStatus: inspection.status,
      observedChecks,
      expectedChecks,
      reviewState: "lightly_inspected",
      headline:
        findings.length > 0 ? "Light inspection with prioritized issues" : "Light inspection only",
      summary:
        findings.length > 0
          ? `This category surfaced ${findings.length} finding${findings.length !== 1 ? "s" : ""}, but only ${observedChecks}/${expectedChecks} deterministic checks ran. The findings are useful directional signals, not a full category verdict.`
          : `Only ${observedChecks}/${expectedChecks} deterministic checks ran here. No issues surfaced, but the evidence is too thin to call the category clear.`,
    };
  }

  if (findings.length === 0) {
    return {
      category,
      score: scores.byCategory[category],
      findingCount: 0,
      findings,
      inspectionStatus: inspection.status,
      observedChecks,
      expectedChecks,
      reviewState: "inspected_clean",
      headline: "Inspected and clean",
      summary:
        `No prioritized issues surfaced across ${observedChecks}/${expectedChecks} deterministic checks in this pass. That is a clean inspected result within the covered signals, not a blanket guarantee beyond them.`,
    };
  }

  return {
    category,
    score: scores.byCategory[category],
    findingCount: findings.length,
    findings,
    inspectionStatus: inspection.status,
    observedChecks,
    expectedChecks,
    reviewState: "inspected_with_findings",
    headline: "Inspected with prioritized findings",
    summary:
      `These findings are supported by ${observedChecks}/${expectedChecks} deterministic checks and represent the clearest issues surfaced in this category.`,
  };
}

export function buildCategoryReviews(
  findings: Finding[],
  scores: CategoryScores
): ReportCategoryReview[] {
  return ALL_FINDING_CATEGORIES.map((category) => {
    const categoryFindings = findings.filter((finding) => finding.category === category);
    return buildCategoryReview(category, categoryFindings, scores);
  });
}

export async function listRecentAuditRuns(limit = 50): Promise<AuditRunListItem[]> {
  return withDbClient(async (client) => {
    const result = await client.query<{
      audit_run_id: string;
      domain: string;
      status: AuditStatus;
      created_at: Date;
      completed_at: Date | null;
      homepage_only: boolean;
      failure_reason: string | null;
    }>(
      `
        SELECT
          ar.id AS audit_run_id,
          td.domain,
          ar.status,
          ar.created_at,
          ar.completed_at,
          ar.homepage_only,
          ar.failure_reason
        FROM audit_runs ar
        JOIN target_domains td ON td.id = ar.target_domain_id
        ORDER BY ar.created_at DESC
        LIMIT $1
      `,
      [limit]
    );

    return result.rows.map((row) => ({
      auditRunId: row.audit_run_id,
      domain: row.domain,
      status: row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      homepageOnly: row.homepage_only,
      failureReason: row.failure_reason,
    }));
  });
}

export const reportRepository: ReportRepository = {
  async getReportData(auditRunId) {
    return withDbClient(async (client) => {
      const runResult = await client.query<AuditRunWithDomainRow>(
        `
          SELECT
            ar.id,
            ar.project_id,
            ar.target_domain_id,
            ar.status,
            ar.homepage_only,
            ar.started_at,
            ar.completed_at,
            ar.failure_reason,
            ar.created_at,
            td.domain
          FROM audit_runs ar
          JOIN target_domains td ON td.id = ar.target_domain_id
          WHERE ar.id = $1
        `,
        [auditRunId]
      );

      const runRow = runResult.rows[0];
      if (!runRow) return null;

      const findingsResult = await client.query<FindingRow>(
        `
          SELECT
            id,
            audit_run_id,
            page_snapshot_id,
            category,
            title,
            description,
            severity,
            confidence,
            evidence_level,
            evidence_ref,
            claim_posture,
            support_type,
            evaluator_status,
            evaluator_notes,
            recommendation,
            review_status,
            review_reason,
            created_at
          FROM findings f
          JOIN page_snapshots ps ON ps.id = f.page_snapshot_id
          WHERE f.audit_run_id = $1
            AND f.evaluator_status = 'accepted'
            AND f.review_status = 'accepted'
            AND ps.page_state = 'accepted'
          ORDER BY category, severity, created_at
        `,
        [auditRunId]
      );

      const evidenceResult = await client.query<{ category: FindingCategory; key: string }>(
        `
          SELECT pe.category, pe.key
          FROM page_evidence pe
          JOIN page_snapshots ps ON ps.id = pe.page_snapshot_id
          WHERE pe.audit_run_id = $1
            AND ps.page_state = 'accepted'
        `,
        [auditRunId]
      );
      const findings = deduplicateFindings(findingsResult.rows.map(mapFinding));
      const inspectionKeysByCategory = evidenceResult.rows.reduce<
        Partial<Record<FindingCategory, string[]>>
      >((acc, row) => {
        const keys = acc[row.category] ?? [];
        if (!keys.includes(row.key)) {
          keys.push(row.key);
        }
        acc[row.category] = keys;
        return acc;
      }, {});
      const prioritizedFindings = prioritizeFindings(findings);
      const scores = scoreAuditByCategory(prioritizedFindings, {
        inspectionKeysByCategory,
      });
      const categoryReviews = buildCategoryReviews(prioritizedFindings, scores);

      return {
        auditRunId,
        domain: runRow.domain,
        auditRun: mapAuditRun(runRow),
        findings: prioritizedFindings,
        topPriorities: selectTopPriorityFindings(prioritizedFindings, 5),
        scores,
        categoryReviews,
      };
    });
  },
};
