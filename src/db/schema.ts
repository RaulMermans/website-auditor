// Logical table names for the raw-SQL schema.
// DDL lives in migrations/ and the Shot 2 repositories use raw pg queries.

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
