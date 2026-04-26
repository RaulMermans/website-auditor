import type { PoolClient } from "pg";
import { withDbClient, withTransaction } from "@/db/client";
import type {
  AuditRun,
  AuditFailureDetails,
  AuditFailureKind,
  AuditFailureStage,
  AuditStatus,
  CaptureMethodProvenance,
  PageEvaluatorStatus,
  PageReviewStatus,
  PageSnapshot,
  PageState,
  PageType,
  TargetDomain,
} from "@/lib/types";

// ─── Row types (DB shape) ────────────────────────────────────────────────────

interface TargetDomainRow {
  id: string;
  domain: string;
  created_at: Date;
}

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
  limitation_note: string | null;
  created_at: Date;
}

interface PageSnapshotRow {
  id: string;
  audit_run_id: string;
  url: string;
  page_type: PageType;
  page_priority: number;
  page_state: PageState;
  retry_count: number;
  last_error: string | null;
  html_storage_key: string | null;
  screenshot_storage_key: string | null;
  captured_at: Date | null;
  capture_method: CaptureMethodProvenance | null;
  review_status: PageReviewStatus;
  escalation_reason: string | null;
  evaluator_status: PageEvaluatorStatus;
}

// ─── Public input/output types ────────────────────────────────────────────────

export interface PendingAuditRunRecord {
  targetDomain: TargetDomain;
  auditRun: AuditRun;
}

export interface AuditRunProgress {
  auditRun: AuditRun;
  pageSnapshots: PageSnapshot[];
}

export interface CreatePendingAuditRunInput {
  domain: string;
  projectId?: string;
}

export interface MarkAuditRunFailedInput {
  auditRunId: string;
  failureReason: string;
  failureKind?: AuditFailureKind | null;
  failureStage?: AuditFailureStage | null;
  failureDetails?: AuditFailureDetails | null;
}

export interface UpdateAuditRunStatusInput {
  auditRunId: string;
  status: AuditStatus;
  homepageOnly?: boolean;
  failureReason?: string | null;
  failureKind?: AuditFailureKind | null;
  failureStage?: AuditFailureStage | null;
  failureDetails?: AuditFailureDetails | null;
  limitationNote?: string | null;
}

export interface InsertPageSnapshotInput {
  auditRunId: string;
  url: string;
  pageType: PageType;
  pagePriority: number;
  pageState?: PageState;
  retryCount?: number;
  lastError?: string | null;
  htmlStorageKey?: string;
  screenshotStorageKey?: string;
  capturedAt?: Date | null;
}

export interface UpdatePageSnapshotStateInput {
  pageSnapshotId: string;
  pageState: PageState;
  retryCount?: number;
  lastError: string | null;
}

export interface CompletePageSnapshotCaptureInput {
  pageSnapshotId: string;
  url: string;
  htmlStorageKey: string;
  screenshotStorageKey?: string | null;
  captureMethod?: CaptureMethodProvenance | null;
  retryCount?: number;
  capturedAt?: Date;
}

export interface InsertAuditRunAttemptInput {
  auditRunId: string;
  pageSnapshotId?: string | null;
  stage: "discover" | "capture" | "analyze" | "enrich";
  attempt: number;
  failureKind?: string | null;
  evaluatorFeedback?: string | null;
  nextRetryStrategy?: string | null;
}

export interface AuditJobRepository {
  createPendingAuditRun(input: CreatePendingAuditRunInput): Promise<PendingAuditRunRecord>;
  getAuditRunProgress(auditRunId: string): Promise<AuditRunProgress>;
  markAuditRunFailed(input: MarkAuditRunFailedInput): Promise<void>;
  updateAuditRunStatus(input: UpdateAuditRunStatusInput): Promise<void>;
  insertPageSnapshot(input: InsertPageSnapshotInput): Promise<PageSnapshot>;
  updatePageSnapshotState(input: UpdatePageSnapshotStateInput): Promise<PageSnapshot>;
  completePageSnapshotCapture(input: CompletePageSnapshotCaptureInput): Promise<PageSnapshot>;
  insertAuditRunAttempt(input: InsertAuditRunAttemptInput): Promise<void>;
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapTargetDomain(row: TargetDomainRow): TargetDomain {
  return {
    id: row.id,
    domain: row.domain,
    createdAt: row.created_at,
  };
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
    limitationNote: row.limitation_note,
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
    captureMethod: row.capture_method ?? undefined,
    reviewStatus: row.review_status,
    escalationReason: row.escalation_reason,
    evaluatorStatus: row.evaluator_status,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function findOrCreateTargetDomain(client: PoolClient, domain: string) {
  const inserted = await client.query<TargetDomainRow>(
    `
      INSERT INTO target_domains (id, domain)
      VALUES ($1, $2)
      ON CONFLICT (domain) DO NOTHING
      RETURNING id, domain, created_at
    `,
    [crypto.randomUUID(), domain]
  );

  if (inserted.rows[0]) {
    return inserted.rows[0];
  }

  const existing = await client.query<TargetDomainRow>(
    `
      SELECT id, domain, created_at
      FROM target_domains
      WHERE domain = $1
    `,
    [domain]
  );

  if (!existing.rows[0]) {
    throw new Error(`Unable to load target domain for ${domain}`);
  }

  return existing.rows[0];
}

// ─── Repository ───────────────────────────────────────────────────────────────

export const auditJobRepository: AuditJobRepository = {
  async createPendingAuditRun({ domain, projectId }) {
    return withTransaction(async (client) => {
      const targetDomainRow = await findOrCreateTargetDomain(client, domain);
      const now = new Date();
      const auditRunId = crypto.randomUUID();
      const auditRunResult = await client.query<AuditRunRow>(
        `
          INSERT INTO audit_runs (
            id,
            project_id,
            target_domain_id,
            status,
            homepage_only,
            started_at,
            created_at
          )
          VALUES ($1, $2, $3, 'pending', FALSE, $4, $4)
          RETURNING
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
            limitation_note,
            created_at
        `,
        [auditRunId, projectId ?? null, targetDomainRow.id, now]
      );

      return {
        targetDomain: mapTargetDomain(targetDomainRow),
        auditRun: mapAuditRun(auditRunResult.rows[0]),
      };
    });
  },

  async getAuditRunProgress(auditRunId) {
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
            limitation_note,
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
            capture_method,
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

  async markAuditRunFailed({
    auditRunId,
    failureReason,
    failureKind,
    failureStage,
    failureDetails,
  }) {
    await withDbClient(async (client) => {
      await client.query(
        `
          UPDATE audit_runs
          SET status = 'failed',
              failure_reason = $2,
              failure_kind = COALESCE($3, failure_kind),
              failure_stage = COALESCE($4, failure_stage),
              failure_details = COALESCE($5::jsonb, failure_details),
              completed_at = $6
          WHERE id = $1
        `,
        [
          auditRunId,
          failureReason,
          failureKind ?? null,
          failureStage ?? null,
          failureDetails ? JSON.stringify(failureDetails) : null,
          new Date(),
        ]
      );
    });
  },

  async updateAuditRunStatus({
    auditRunId,
    status,
    homepageOnly,
    failureReason,
    failureKind,
    failureStage,
    failureDetails,
    limitationNote,
  }) {
    await withDbClient(async (client) => {
      const completed = status === "complete" || status === "failed" ? new Date() : null;
      await client.query(
        `
          UPDATE audit_runs
          SET status = $2,
              homepage_only = COALESCE($3::boolean, homepage_only),
              failure_reason = CASE
                WHEN $4::text IS NOT NULL THEN $4::text
                WHEN $2 = 'failed' THEN failure_reason
                ELSE NULL
              END,
              failure_kind = CASE
                WHEN $5::text IS NOT NULL THEN $5::text
                WHEN $2 = 'failed' THEN failure_kind
                ELSE NULL
              END,
              failure_stage = CASE
                WHEN $6::text IS NOT NULL THEN $6::text
                WHEN $2 = 'failed' THEN failure_stage
                ELSE NULL
              END,
              failure_details = CASE
                WHEN $7::jsonb IS NOT NULL THEN $7::jsonb
                WHEN $2 = 'failed' THEN failure_details
                ELSE NULL
              END,
              completed_at = CASE
                WHEN $8::timestamptz IS NOT NULL THEN $8::timestamptz
                WHEN $2 IN ('complete', 'failed') THEN completed_at
                ELSE NULL
              END,
              limitation_note = COALESCE($9::text, limitation_note)
          WHERE id = $1
        `,
        [
          auditRunId,
          status,
          homepageOnly ?? null,
          failureReason ?? null,
          failureKind ?? null,
          failureStage ?? null,
          failureDetails ? JSON.stringify(failureDetails) : null,
          completed,
          limitationNote ?? null,
        ]
      );
    });
  },

  async insertPageSnapshot({
    auditRunId,
    url,
    pageType,
    pagePriority,
    pageState,
    retryCount,
    lastError,
    htmlStorageKey,
    screenshotStorageKey,
    capturedAt,
  }) {
    return withTransaction(async (client) => {
      const existing = await client.query<PageSnapshotRow>(
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
            AND url = $2
          LIMIT 1
        `,
        [auditRunId, url]
      );

      if (existing.rows[0]) {
        const updated = await client.query<PageSnapshotRow>(
          `
            UPDATE page_snapshots
            SET page_type = $2,
                page_priority = $3
            WHERE id = $1
            RETURNING
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
              capture_method,
              review_status,
              escalation_reason,
              evaluator_status
          `,
          [existing.rows[0].id, pageType, pagePriority]
        );

        return mapPageSnapshot(updated.rows[0]);
      }

      const result = await client.query<PageSnapshotRow>(
        `
          INSERT INTO page_snapshots (
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
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'queued', NULL, 'queued')
          RETURNING
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
            capture_method,
            review_status,
            escalation_reason,
            evaluator_status
        `,
        [
          crypto.randomUUID(),
          auditRunId,
          url,
          pageType,
          pagePriority,
          pageState ?? "queued",
          retryCount ?? 0,
          lastError ?? null,
          htmlStorageKey ?? null,
          screenshotStorageKey ?? null,
          capturedAt ?? null,
        ]
      );
      return mapPageSnapshot(result.rows[0]);
    });
  },

  async updatePageSnapshotState({ pageSnapshotId, pageState, retryCount, lastError }) {
    return withDbClient(async (client) => {
      const result = await client.query<PageSnapshotRow>(
        `
          UPDATE page_snapshots
          SET page_state = $2,
              retry_count = COALESCE($3, retry_count),
              last_error = $4
          WHERE id = $1
          RETURNING
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
            capture_method,
            review_status,
            escalation_reason,
            evaluator_status
        `,
        [pageSnapshotId, pageState, retryCount ?? null, lastError]
      );

      return mapPageSnapshot(result.rows[0]);
    });
  },

  async completePageSnapshotCapture({
    pageSnapshotId,
    url,
    htmlStorageKey,
    screenshotStorageKey,
    captureMethod,
    retryCount,
    capturedAt,
  }) {
    return withDbClient(async (client) => {
      const result = await client.query<PageSnapshotRow>(
        `
          UPDATE page_snapshots
          SET url = $2,
              html_storage_key = $3,
              screenshot_storage_key = $4,
              page_state = 'captured',
              retry_count = COALESCE($5, retry_count),
              last_error = NULL,
              captured_at = $6,
              capture_method = COALESCE($7::text, capture_method)
          WHERE id = $1
          RETURNING
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
            capture_method,
            review_status,
            escalation_reason,
            evaluator_status
        `,
        [
          pageSnapshotId,
          url,
          htmlStorageKey,
          screenshotStorageKey,
          retryCount ?? null,
          capturedAt ?? new Date(),
          captureMethod ?? null,
        ]
      );

      return mapPageSnapshot(result.rows[0]);
    });
  },

  async insertAuditRunAttempt({
    auditRunId,
    pageSnapshotId,
    stage,
    attempt,
    failureKind,
    evaluatorFeedback,
    nextRetryStrategy,
  }) {
    await withDbClient(async (client) => {
      await client.query(
        `
          INSERT INTO audit_run_attempts (
            id,
            audit_run_id,
            page_snapshot_id,
            stage,
            attempt,
            failure_kind,
            evaluator_feedback,
            next_retry_strategy,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        `,
        [
          crypto.randomUUID(),
          auditRunId,
          pageSnapshotId ?? null,
          stage,
          attempt,
          failureKind ?? null,
          evaluatorFeedback ?? null,
          nextRetryStrategy ?? null,
        ]
      );
    });
  },
};
