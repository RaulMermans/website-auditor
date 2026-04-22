import type { PoolClient } from "pg";
import { withDbClient, withTransaction } from "@/db/client";
import type {
  AuditRun,
  AuditStatus,
  PageEvaluatorStatus,
  PageReviewStatus,
  PageSnapshot,
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

// ─── Public input/output types ────────────────────────────────────────────────

export interface PendingAuditRunRecord {
  targetDomain: TargetDomain;
  auditRun: AuditRun;
}

export interface CreatePendingAuditRunInput {
  domain: string;
  projectId?: string;
}

export interface MarkAuditRunFailedInput {
  auditRunId: string;
  failureReason: string;
}

export interface UpdateAuditRunStatusInput {
  auditRunId: string;
  status: AuditStatus;
  homepageOnly?: boolean;
  failureReason?: string | null;
}

export interface InsertPageSnapshotInput {
  auditRunId: string;
  url: string;
  pageType: PageType;
  htmlStorageKey?: string;
  screenshotStorageKey?: string;
}

export interface AuditJobRepository {
  createPendingAuditRun(input: CreatePendingAuditRunInput): Promise<PendingAuditRunRecord>;
  markAuditRunFailed(input: MarkAuditRunFailedInput): Promise<void>;
  updateAuditRunStatus(input: UpdateAuditRunStatusInput): Promise<void>;
  insertPageSnapshot(input: InsertPageSnapshotInput): Promise<PageSnapshot>;
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

  async markAuditRunFailed({ auditRunId, failureReason }) {
    await withDbClient(async (client) => {
      await client.query(
        `
          UPDATE audit_runs
          SET status = 'failed',
              failure_reason = $2,
              completed_at = $3
          WHERE id = $1
        `,
        [auditRunId, failureReason, new Date()]
      );
    });
  },

  async updateAuditRunStatus({ auditRunId, status, homepageOnly, failureReason }) {
    await withDbClient(async (client) => {
      const completed = status === "complete" || status === "failed" ? new Date() : null;
      await client.query(
        `
          UPDATE audit_runs
          SET status = $2,
              homepage_only = COALESCE($3, homepage_only),
              failure_reason = COALESCE($4, failure_reason),
              completed_at = COALESCE($5, completed_at)
          WHERE id = $1
        `,
        [
          auditRunId,
          status,
          homepageOnly ?? null,
          failureReason ?? null,
          completed,
        ]
      );
    });
  },

  async insertPageSnapshot({ auditRunId, url, pageType, htmlStorageKey, screenshotStorageKey }) {
    return withDbClient(async (client) => {
      const result = await client.query<PageSnapshotRow>(
        `
          INSERT INTO page_snapshots (
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
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'capturing', 0, NULL, 'queued')
          RETURNING
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
        `,
        [
          crypto.randomUUID(),
          auditRunId,
          url,
          pageType,
          htmlStorageKey ?? null,
          screenshotStorageKey ?? null,
          new Date(),
        ]
      );
      return mapPageSnapshot(result.rows[0]);
    });
  },
};
