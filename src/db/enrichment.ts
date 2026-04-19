import { randomUUID } from "crypto";
import { withDbClient } from "@/db/client";
import type { OutreachAsset } from "@/lib/types";

interface OutreachAssetRow {
  id: string;
  audit_run_id: string;
  type: OutreachAsset["type"];
  content: string;
  generated_at: Date;
}

function mapAsset(row: OutreachAssetRow): OutreachAsset {
  return {
    id: row.id,
    auditRunId: row.audit_run_id,
    type: row.type,
    content: row.content,
    generatedAt: row.generated_at,
  };
}

export const enrichmentRepository = {
  async saveAsset(
    auditRunId: string,
    type: OutreachAsset["type"],
    content: string
  ): Promise<OutreachAsset> {
    return withDbClient(async (client) => {
      const result = await client.query<OutreachAssetRow>(
        `INSERT INTO outreach_assets (id, audit_run_id, type, content)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (audit_run_id, type) DO UPDATE SET content = EXCLUDED.content, generated_at = NOW()
         RETURNING *`,
        [randomUUID(), auditRunId, type, content]
      );
      return mapAsset(result.rows[0]);
    });
  },

  async getAssetsForAuditRun(auditRunId: string): Promise<OutreachAsset[]> {
    return withDbClient(async (client) => {
      const result = await client.query<OutreachAssetRow>(
        `SELECT id, audit_run_id, type, content, generated_at
         FROM outreach_assets
         WHERE audit_run_id = $1
         ORDER BY generated_at`,
        [auditRunId]
      );
      return result.rows.map(mapAsset);
    });
  },
};
