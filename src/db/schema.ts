// DB schema placeholder — defines the logical shape of each table.
// Actual DDL lives in migrations/. ORM/query-builder TBD.
//
// Convention: every table has (id uuid PK, created_at timestamptz).
// Migrations must be reversible (up + down).

export const TABLES = {
  projects: "projects",
  target_domains: "target_domains",
  audit_runs: "audit_runs",
  page_snapshots: "page_snapshots",
  page_evidence: "page_evidence",
  findings: "findings",
  recommendations: "recommendations",
  rubrics: "rubrics",
  scorecards: "scorecards",
  outreach_assets: "outreach_assets",
} as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES];

// TODO: add typed query helpers per entity once DB client is chosen (Shot 2+)
