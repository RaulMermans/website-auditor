-- Shot 16: canonical audit failure classification for blocked-site vs runtime handling.

ALTER TABLE audit_runs
  ADD COLUMN IF NOT EXISTS failure_kind TEXT
  CHECK (
    failure_kind IS NULL OR failure_kind IN (
      'blocked',
      'access_denied',
      'auth_wall',
      'capture_blocked',
      'runtime_error',
      'analysis_error',
      'unknown'
    )
  ),
  ADD COLUMN IF NOT EXISTS failure_stage TEXT
  CHECK (
    failure_stage IS NULL OR failure_stage IN (
      'discover',
      'capture',
      'analyze',
      'report'
    )
  ),
  ADD COLUMN IF NOT EXISTS failure_details JSONB;

CREATE INDEX IF NOT EXISTS audit_runs_failure_kind_idx
  ON audit_runs (failure_kind);
