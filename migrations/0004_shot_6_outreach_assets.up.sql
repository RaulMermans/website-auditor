-- Shot 6: LLM-generated enrichment and outreach text assets.
-- One row per (audit_run_id, type). Upsert-safe via unique constraint.

CREATE TABLE IF NOT EXISTS outreach_assets (
  id              UUID PRIMARY KEY,
  audit_run_id    UUID NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (
    type IN ('summary', 'quick_wins', 'email', 'collaboration', 'loom_script')
  ),
  content         TEXT NOT NULL,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (audit_run_id, type)
);

CREATE INDEX IF NOT EXISTS outreach_assets_audit_run_id_idx
  ON outreach_assets (audit_run_id);
