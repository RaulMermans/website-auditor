import { Client } from "pg";
import type { PageSnapshotPayload } from "./types.js";

// We use raw pg here like the main app, but we don't import main app DB code
// to maintain the structural boundary and avoid pulling next/app deps.

export async function updateAuditRunStatus(
  databaseUrl: string,
  auditRunId: string,
  status: "discovering" | "capturing" | "complete" | "failed",
  failureReason?: string,
  homepageOnly?: boolean
) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  
  try {
    const completed = status === "complete" || status === "failed" ? new Date() : null;
    await client.query(
      `
        UPDATE audit_runs
        SET status = $2,
            failure_reason = COALESCE($3, failure_reason),
            homepage_only = COALESCE($4, homepage_only),
            completed_at = COALESCE($5, completed_at)
        WHERE id = $1
      `,
      [auditRunId, status, failureReason ?? null, homepageOnly ?? null, completed]
    );
  } finally {
    await client.end();
  }
}

export async function persistPageSnapshot(
  databaseUrl: string,
  payload: PageSnapshotPayload
) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    // Generate UUID v4 inline since crypto.randomUUID requires node 19+
    const crypto = await import("node:crypto");
    const id = crypto.randomUUID();
    
    await client.query(
      `
        INSERT INTO page_snapshots (
          id, audit_run_id, url, page_type, html_storage_key, screenshot_storage_key
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        id,
        payload.auditRunId,
        payload.url,
        payload.pageType,
        payload.htmlStorageKey ?? null,
        payload.screenshotStorageKey ?? null,
      ]
    );
  } finally {
    await client.end();
  }
}
