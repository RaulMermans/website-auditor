import { withDbClient, withTransaction } from "@/db/client";
import type {
  AuditRun,
  ClaimPosture,
  EvidenceLabel,
  Finding,
  FindingCategory,
  FindingConfidence,
  FindingEvaluatorStatus,
  FindingSeverity,
  FindingSupportType,
  PageEvaluatorStatus,
  PageEvidence,
  PageReviewStatus,
  PageSnapshot,
  PageType,
} from "@/lib/types";

interface AuditRunRow {
  id: string;
  project_id: string | null;
  target_domain_id: string;
  status: AuditRun["status"];
  homepage_only: boolean;
  started_at: Date;
  completed_at: Date | null;
  failure_reason: string | null;
  created_at: Date;
}

interface PageSnapshotRow {
  id: string;
  audit_run_id: string;
  url: string;
  page_type: PageType;
  html_storage_key: string | null;
  screenshot_storage_key: string | null;
  captured_at: Date;
  review_status: PageReviewStatus;
  retry_count: number;
  escalation_reason: string | null;
  evaluator_status: PageEvaluatorStatus;
}

interface PageEvidenceRow {
  id: string;
  audit_run_id: string;
  page_snapshot_id: string;
  category: FindingCategory;
  key: string;
  value: unknown;
  evidence_level: EvidenceLabel;
  created_at: Date;
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
  created_at: Date;
}

export interface AuditAnalysisContext {
  auditRun: AuditRun;
  pageSnapshots: PageSnapshot[];
}

export interface CreatePageEvidenceInput {
  auditRunId: string;
  pageSnapshotId: string;
  category: FindingCategory;
  key: string;
  value: unknown;
  evidenceLevel: EvidenceLabel;
}

export interface CreateFindingInput {
  auditRunId: string;
  pageSnapshotId: string;
  category: FindingCategory;
  title: string;
  description: string;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  evidenceLevel: EvidenceLabel;
  evidenceRef: Record<string, unknown>;
  claimPosture?: ClaimPosture;
  supportType?: FindingSupportType;
  evaluatorStatus?: FindingEvaluatorStatus;
  evaluatorNotes?: string | null;
  recommendation: string;
}

export interface UpdatePageReviewStateInput {
  pageSnapshotId: string;
  reviewStatus: PageReviewStatus;
  retryCount: number;
  escalationReason: string | null;
  evaluatorStatus: PageEvaluatorStatus;
}

export interface ReplaceAuditAnalysisInput {
  auditRunId: string;
  pageEvidence: CreatePageEvidenceInput[];
  findings: CreateFindingInput[];
}

export interface ReplaceAuditAnalysisResult {
  pageEvidence: PageEvidence[];
  findings: Finding[];
}

export interface AuditAnalysisRepository {
  getAuditAnalysisContext(auditRunId: string): Promise<AuditAnalysisContext>;
  updatePageReviewState(input: UpdatePageReviewStateInput): Promise<void>;
  replaceAuditAnalysis(input: ReplaceAuditAnalysisInput): Promise<ReplaceAuditAnalysisResult>;
}

function mapAuditRun(row: AuditRunRow): AuditRun {
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

function mapPageSnapshot(row: PageSnapshotRow): PageSnapshot {
  return {
    id: row.id,
    auditRunId: row.audit_run_id,
    url: row.url,
    pageType: row.page_type,
    htmlStorageKey: row.html_storage_key ?? undefined,
    screenshotStorageKey: row.screenshot_storage_key ?? undefined,
    capturedAt: row.captured_at,
    reviewStatus: row.review_status,
    retryCount: row.retry_count,
    escalationReason: row.escalation_reason,
    evaluatorStatus: row.evaluator_status,
  };
}

function mapPageEvidence(row: PageEvidenceRow): PageEvidence {
  return {
    id: row.id,
    auditRunId: row.audit_run_id,
    pageSnapshotId: row.page_snapshot_id,
    category: row.category,
    key: row.key,
    value: row.value,
    evidenceLevel: row.evidence_level,
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
    createdAt: row.created_at,
  };
}

function deriveClaimPosture(evidenceLevel: EvidenceLabel): ClaimPosture {
  if (evidenceLevel === "Measured") {
    return "confirmed";
  }

  if (evidenceLevel === "Observed") {
    return "observed_pattern";
  }

  return "directional";
}

function deriveSupportType(
  evidenceLevel: EvidenceLabel,
  evidenceRef: Record<string, unknown>
): FindingSupportType {
  if (evidenceLevel === "Inferred") {
    return "inferred";
  }

  const pageCount =
    typeof evidenceRef.pageCount === "number"
      ? evidenceRef.pageCount
      : evidenceRef.pageUrl
        ? 1
        : 0;

  return pageCount > 1 ? "cross_page" : "dom";
}

export const auditAnalysisRepository: AuditAnalysisRepository = {
  async getAuditAnalysisContext(auditRunId) {
    return withDbClient(async (client) => {
      const auditRunResult = await client.query<AuditRunRow>(
        `
          SELECT
            id,
            project_id,
            target_domain_id,
            status,
            homepage_only,
            started_at,
            completed_at,
            failure_reason,
            created_at
          FROM audit_runs
          WHERE id = $1
        `,
        [auditRunId]
      );

      const auditRun = auditRunResult.rows[0];

      if (!auditRun) {
        throw new Error(`Audit run not found: ${auditRunId}`);
      }

      const pageSnapshotResult = await client.query<PageSnapshotRow>(
        `
          SELECT
            id,
            audit_run_id,
            url,
            page_type,
            html_storage_key,
            screenshot_storage_key,
            captured_at,
            review_status,
            retry_count,
            escalation_reason,
            evaluator_status
          FROM page_snapshots
          WHERE audit_run_id = $1
          ORDER BY captured_at ASC, url ASC
        `,
        [auditRunId]
      );

      return {
        auditRun: mapAuditRun(auditRun),
        pageSnapshots: pageSnapshotResult.rows.map(mapPageSnapshot),
      };
    });
  },

  async updatePageReviewState({
    pageSnapshotId,
    reviewStatus,
    retryCount,
    escalationReason,
    evaluatorStatus,
  }) {
    await withDbClient(async (client) => {
      await client.query(
        `
          UPDATE page_snapshots
          SET review_status = $2,
              retry_count = $3,
              escalation_reason = $4,
              evaluator_status = $5
          WHERE id = $1
        `,
        [pageSnapshotId, reviewStatus, retryCount, escalationReason, evaluatorStatus]
      );
    });
  },

  async replaceAuditAnalysis({ auditRunId, pageEvidence, findings }) {
    return withTransaction(async (client) => {
      await client.query(`DELETE FROM findings WHERE audit_run_id = $1`, [auditRunId]);
      await client.query(`DELETE FROM page_evidence WHERE audit_run_id = $1`, [auditRunId]);

      const insertedPageEvidence: PageEvidence[] = [];
      for (const evidence of pageEvidence) {
        const result = await client.query<PageEvidenceRow>(
          `
            INSERT INTO page_evidence (
              id,
              audit_run_id,
              page_snapshot_id,
              category,
              key,
              value,
              evidence_level
            )
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
            RETURNING
              id,
              audit_run_id,
              page_snapshot_id,
              category,
              key,
              value,
              evidence_level,
              created_at
          `,
          [
            crypto.randomUUID(),
            evidence.auditRunId,
            evidence.pageSnapshotId,
            evidence.category,
            evidence.key,
            JSON.stringify(evidence.value ?? null),
            evidence.evidenceLevel,
          ]
        );

        insertedPageEvidence.push(mapPageEvidence(result.rows[0]));
      }

      const insertedFindings: Finding[] = [];
      for (const finding of findings) {
        const result = await client.query<FindingRow>(
          `
            INSERT INTO findings (
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
              recommendation
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15)
            RETURNING
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
              created_at
          `,
          [
            crypto.randomUUID(),
            finding.auditRunId,
            finding.pageSnapshotId,
            finding.category,
            finding.title,
            finding.description,
            finding.severity,
            finding.confidence,
            finding.evidenceLevel,
            JSON.stringify(finding.evidenceRef ?? {}),
            finding.claimPosture ?? deriveClaimPosture(finding.evidenceLevel),
            finding.supportType ?? deriveSupportType(finding.evidenceLevel, finding.evidenceRef),
            finding.evaluatorStatus ?? "accepted",
            finding.evaluatorNotes ?? null,
            finding.recommendation,
          ]
        );

        insertedFindings.push(mapFinding(result.rows[0]));
      }

      return {
        pageEvidence: insertedPageEvidence,
        findings: insertedFindings,
      };
    });
  },
};
