import type { PoolClient } from "pg";
import { withDbClient, withTransaction } from "@/db/client";
import type { AuditRun, TargetDomain } from "@/lib/types";

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

export interface AuditJobRepository {
  createPendingAuditRun(input: CreatePendingAuditRunInput): Promise<PendingAuditRunRecord>;
  markAuditRunFailed(input: MarkAuditRunFailedInput): Promise<void>;
}

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
};
