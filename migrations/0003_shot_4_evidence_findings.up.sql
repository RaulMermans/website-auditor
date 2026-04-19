-- Shot 4: persist deterministic page evidence and rule-based findings.

CREATE TABLE IF NOT EXISTS page_evidence (
  id               UUID PRIMARY KEY,
  audit_run_id     UUID NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  page_snapshot_id UUID NOT NULL REFERENCES page_snapshots(id) ON DELETE CASCADE,
  category         TEXT NOT NULL CHECK (
    category IN (
      'performance',
      'technical_seo',
      'accessibility',
      'ux_ui',
      'messaging_content',
      'conversion',
      'trust_signals',
      'mobile_experience'
    )
  ),
  key              TEXT NOT NULL,
  value            JSONB NOT NULL,
  evidence_level   TEXT NOT NULL CHECK (evidence_level IN ('Measured', 'Observed', 'Inferred')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS page_evidence_audit_run_id_idx
  ON page_evidence (audit_run_id);

CREATE INDEX IF NOT EXISTS page_evidence_page_snapshot_id_idx
  ON page_evidence (page_snapshot_id);

CREATE TABLE IF NOT EXISTS findings (
  id               UUID PRIMARY KEY,
  audit_run_id     UUID NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  page_snapshot_id UUID NOT NULL REFERENCES page_snapshots(id) ON DELETE CASCADE,
  category         TEXT NOT NULL CHECK (
    category IN (
      'performance',
      'technical_seo',
      'accessibility',
      'ux_ui',
      'messaging_content',
      'conversion',
      'trust_signals',
      'mobile_experience'
    )
  ),
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  severity         TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  confidence       TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  evidence_level   TEXT NOT NULL CHECK (evidence_level IN ('Measured', 'Observed', 'Inferred')),
  evidence_ref     JSONB NOT NULL DEFAULT '{}'::jsonb,
  recommendation   TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS findings_audit_run_id_idx
  ON findings (audit_run_id);

CREATE INDEX IF NOT EXISTS findings_page_snapshot_id_idx
  ON findings (page_snapshot_id);
