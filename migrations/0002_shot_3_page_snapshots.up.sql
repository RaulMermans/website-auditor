-- Shot 3: expand audit_run status values and add page_snapshots table.

-- Alter the status CHECK constraint to include Shot 3 transitions.
ALTER TABLE audit_runs
  DROP CONSTRAINT IF EXISTS audit_runs_status_check;

ALTER TABLE audit_runs
  ADD CONSTRAINT audit_runs_status_check
  CHECK (status IN ('pending', 'discovering', 'capturing', 'analyzing', 'complete', 'failed'));

CREATE TABLE IF NOT EXISTS page_snapshots (
  id               UUID PRIMARY KEY,
  audit_run_id     UUID NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  url              TEXT NOT NULL,
  page_type        TEXT NOT NULL CHECK (page_type IN ('homepage', 'about', 'services', 'contact', 'content', 'other')),
  html_storage_key TEXT,
  screenshot_storage_key TEXT,
  captured_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS page_snapshots_audit_run_id_idx
  ON page_snapshots (audit_run_id);
