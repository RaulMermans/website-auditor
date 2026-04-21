import { withDbClient } from "@/db/client";
import type {
  AuditRun,
  AuditStatus,
  EvidenceLabel,
  Finding,
  FindingCategory,
  FindingConfidence,
  FindingSeverity,
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
  recommendation: string;
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
    recommendation: row.recommendation,
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
        "This category was not meaningfully inspected in the current deterministic pass. Absence of findings here should not be read as a clean result.",
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
      headline: findings.length > 0 ? "Light inspection with issues" : "Light inspection only",
      summary:
        findings.length > 0
          ? `This category surfaced ${findings.length} finding${findings.length !== 1 ? "s" : ""}, but only ${observedChecks}/${expectedChecks} deterministic checks were covered.`
          : `Only ${observedChecks}/${expectedChecks} deterministic checks were covered here, so the category should not be treated as fully clear.`,
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
      headline: "Inspected and currently clean",
      summary:
        `No issues surfaced across ${observedChecks}/${expectedChecks} deterministic checks in this category during the current pass.`,
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
    headline: `${findings.length} prioritized finding${findings.length !== 1 ? "s" : ""}`,
    summary:
      `These findings are supported by ${observedChecks}/${expectedChecks} deterministic checks in this category.`,
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
            recommendation,
            created_at
          FROM findings
          WHERE audit_run_id = $1
          ORDER BY category, severity, created_at
        `,
        [auditRunId]
      );

      const findings = findingsResult.rows.map(mapFinding);

      const evidenceResult = await client.query<{ category: FindingCategory; key: string }>(
        `SELECT category, key FROM page_evidence WHERE audit_run_id = $1`,
        [auditRunId]
      );
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
