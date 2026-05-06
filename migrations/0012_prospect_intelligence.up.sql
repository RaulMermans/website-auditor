CREATE TABLE IF NOT EXISTS prospect_intelligence (
  id                              UUID PRIMARY KEY,
  audit_run_id                    UUID NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  prospect_fit_score              INTEGER NOT NULL CHECK (prospect_fit_score >= 0 AND prospect_fit_score <= 100),
  commercial_opportunity_score    INTEGER NOT NULL CHECK (commercial_opportunity_score >= 0 AND commercial_opportunity_score <= 100),
  capture_fidelity                TEXT NOT NULL CHECK (
    capture_fidelity IN (
      'rendered_browser',
      'static_public',
      'secondary_static',
      'manual_evidence',
      'blocked_no_evidence'
    )
  ),
  confidence                      TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  primary_gap                     TEXT NOT NULL,
  recommended_service             TEXT NOT NULL,
  outreach_angle                  TEXT NOT NULL,
  result_json                     JSONB NOT NULL,
  model                           TEXT NOT NULL,
  prompt_version                  TEXT NOT NULL,
  schema_version                  TEXT NOT NULL,
  input_hash                      TEXT NOT NULL,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (audit_run_id)
);

CREATE INDEX IF NOT EXISTS prospect_intelligence_audit_run_id_idx
  ON prospect_intelligence (audit_run_id);
