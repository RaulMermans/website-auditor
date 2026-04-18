-- Revert Shot 3 changes.

DROP TABLE IF EXISTS page_snapshots;

ALTER TABLE audit_runs
  DROP CONSTRAINT IF EXISTS audit_runs_status_check;

ALTER TABLE audit_runs
  ADD CONSTRAINT audit_runs_status_check
  CHECK (status IN ('pending', 'failed'));
