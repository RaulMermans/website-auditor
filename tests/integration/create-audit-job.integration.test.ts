import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { createAuditJob } from "@/server/audits/create-audit-job";
import { resetDbPool } from "@/db/client";
import { stopQueueClient } from "@/server/contracts/queue";
import { runAllMigrations } from "../../scripts/migration-helpers.mjs";

const databaseUrl = process.env.DATABASE_URL;
const pgBossSchema = process.env.PG_BOSS_SCHEMA;

if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set for integration tests.");
}

if (!pgBossSchema || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(pgBossSchema)) {
  throw new Error("PG_BOSS_SCHEMA must be set to a safe schema name for integration tests.");
}

async function withClient<T>(callback: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

describe("Shot 2 integration: createAuditJob", () => {
  beforeAll(async () => {
    await stopQueueClient();
    await resetDbPool();
    await runAllMigrations({ direction: "down", databaseUrl }).catch(() => {});
    await runAllMigrations({ direction: "up", databaseUrl });
  });

  afterAll(async () => {
    await stopQueueClient();
    await resetDbPool();

    await withClient(async (client) => {
      await client.query(`DROP SCHEMA IF EXISTS "${pgBossSchema}" CASCADE`);
    });

    await runAllMigrations({ direction: "down", databaseUrl });
  });

  it("applies the real migration, persists rows, and enqueues a real pg-boss job", async () => {
    const result = await createAuditJob({ domain: "https://Example.com/" });

    await withClient(async (client) => {
      const targetDomains = await client.query<{
        id: string;
        domain: string;
      }>(
        `
          SELECT id, domain
          FROM target_domains
          WHERE domain = $1
        `,
        ["example.com"]
      );

      expect(targetDomains.rowCount).toBe(1);
      expect(targetDomains.rows[0]?.domain).toBe("example.com");

      const auditRuns = await client.query<{
        id: string;
        target_domain_id: string;
        status: string;
        homepage_only: boolean;
      }>(
        `
          SELECT id, target_domain_id, status, homepage_only
          FROM audit_runs
          WHERE id = $1
        `,
        [result.auditRun.id]
      );

      expect(auditRuns.rowCount).toBe(1);
      expect(auditRuns.rows[0]?.target_domain_id).toBe(targetDomains.rows[0]?.id);
      expect(auditRuns.rows[0]?.status).toBe("pending");
      expect(auditRuns.rows[0]?.homepage_only).toBe(false);

      const queuedJobs = await client.query<{
        id: string;
        name: string;
        data: { auditRunId: string; domain: string };
      }>(
        `
          SELECT id, name, data
          FROM "${pgBossSchema}".job
          WHERE id = $1 AND name = $2
        `,
        [result.jobId, "audit.run"]
      );

      expect(queuedJobs.rowCount).toBe(1);
      expect(queuedJobs.rows[0]?.data).toMatchObject({
        auditRunId: result.auditRun.id,
        domain: "example.com",
      });
    });
  });
});
