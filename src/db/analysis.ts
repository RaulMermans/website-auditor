import { withDbClient, withTransaction } from "@/db/client";
import type {
  AuditRun,
  AuditFailureDetails,
  AuditFailureKind,
  AuditFailureStage,
  ClaimPosture,
  EvidenceLabel,
  Finding,
  FindingCategory,
  FindingConfidence,
  FindingEvaluatorStatus,
  FindingReviewStatus,
  FindingSeverity,
  FindingSupportType,
  PageEvaluatorStatus,
  PageEvidence,
  PageReviewStatus,
  PageSnapshot,
  PageState,
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
  failure_kind: AuditFailureKind | null;
  failure_stage: AuditFailureStage | null;
  failure_details: AuditFailureDetails | null;
  created_at: Date;
}

interface PageSnapshotRow {
  id: string;
  audit_run_id: string;
  url: string;
  page_type: PageSnapshot["pageType"];
  page_priority: number;
  page_state: PageState;
  retry_count: number;
  last_error: string | null;
  html_storage_key: string | null;
  screenshot_storage_key: string | null;
  captured_at: Date | null;
  review_status: PageReviewStatus;
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
  review_status: FindingReviewStatus;
  review_reason: string | null;
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
  reviewStatus?: FindingReviewStatus;
  reviewReason?: string | null;
}

export interface UpdatePageReviewStateInput {
  pageSnapshotId: string;
  reviewStatus: PageReviewStatus;
  retryCount: number;
  escalationReason: string | null;
  evaluatorStatus: PageEvaluatorStatus;
}

export interface ReplacePageAnalysisInput {
  auditRunId: string;
  pageSnapshotId: string;
  pageEvidence: CreatePageEvidenceInput[];
  findings: CreateFindingInput[];
}

export interface PersistedAuditAnalysisResult {
  pageEvidence: PageEvidence[];
  findings: Finding[];
}

export interface AuditAnalysisRepository {
  getAuditAnalysisContext(auditRunId: string): Promise<AuditAnalysisContext>;
  updatePageReviewState(input: UpdatePageReviewStateInput): Promise<void>;
  replacePageAnalysis(input: ReplacePageAnalysisInput): Promise<void>;
  getPersistedAuditAnalysis(auditRunId: string): Promise<PersistedAuditAnalysisResult>;
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
    failureKind: row.failure_kind,
    failureStage: row.failure_stage,
    failureDetails: row.failure_details,
    createdAt: row.created_at,
  };
}

function mapPageSnapshot(row: PageSnapshotRow): PageSnapshot {
  return {
    id: row.id,
    auditRunId: row.audit_run_id,
    url: row.url,
    pageType: row.page_type,
    pagePriority: row.page_priority,
    pageState: row.page_state,
    retryCount: row.retry_count,
    lastError: row.last_error,
    htmlStorageKey: row.html_storage_key ?? undefined,
    screenshotStorageKey: row.screenshot_storage_key ?? undefined,
    capturedAt: row.captured_at,
    reviewStatus: row.review_status,
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
    reviewStatus: row.review_status,
    reviewReason: row.review_reason,
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
            failure_kind,
            failure_stage,
            failure_details,
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
            page_priority,
            page_state,
            retry_count,
            last_error,
            html_storage_key,
            screenshot_storage_key,
            captured_at,
            review_status,
            escalation_reason,
            evaluator_status
          FROM page_snapshots
          WHERE audit_run_id = $1
          ORDER BY page_priority ASC, url ASC
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

  async replacePageAnalysis({ auditRunId, pageSnapshotId, pageEvidence, findings }) {
    return withTransaction(async (client) => {
      await client.query(
        `DELETE FROM findings WHERE audit_run_id = $1 AND page_snapshot_id = $2`,
        [auditRunId, pageSnapshotId]
      );
      await client.query(
        `DELETE FROM page_evidence WHERE audit_run_id = $1 AND page_snapshot_id = $2`,
        [auditRunId, pageSnapshotId]
      );

      for (const evidence of pageEvidence) {
        await client.query<PageEvidenceRow>(
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
      }

      for (const finding of findings) {
        await client.query<FindingRow>(
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
              recommendation,
              review_status,
              review_reason
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17)
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
              review_status,
              review_reason,
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
              finding.reviewStatus ?? "accepted",
              finding.reviewReason ?? null,
          ]
        );
      }
    });
  },

  async getPersistedAuditAnalysis(auditRunId) {
    return withDbClient(async (client) => {
      const pageEvidenceResult = await client.query<PageEvidenceRow>(
        `
          SELECT
            id,
            audit_run_id,
            page_snapshot_id,
            category,
            key,
            value,
            evidence_level,
            created_at
          FROM page_evidence
          WHERE audit_run_id = $1
          ORDER BY page_snapshot_id ASC, category ASC, key ASC, created_at ASC
        `,
        [auditRunId]
      );

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
          FROM findings
          WHERE audit_run_id = $1
          ORDER BY page_snapshot_id ASC, category ASC, created_at ASC
        `,
        [auditRunId]
      );

      return {
        pageEvidence: pageEvidenceResult.rows.map(mapPageEvidence),
        findings: findingsResult.rows.map(mapFinding),
      };
    });
  },
};
