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
  scoreAuditByCategory,
  type CategoryScores,
} from "@/server/scoring/score-audit";

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

export interface ReportData {
  auditRunId: string;
  domain: string;
  auditRun: AuditRun;
  findings: Finding[];
  scores: CategoryScores;
}

export interface ReportRepository {
  getReportData(auditRunId: string): Promise<ReportData | null>;
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

      return {
        auditRunId,
        domain: runRow.domain,
        auditRun: mapAuditRun(runRow),
        findings,
        scores: scoreAuditByCategory(findings),
      };
    });
  },
};
