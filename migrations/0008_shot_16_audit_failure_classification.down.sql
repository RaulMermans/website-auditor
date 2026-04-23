DROP INDEX IF EXISTS audit_runs_failure_kind_idx;

ALTER TABLE audit_runs
  DROP COLUMN IF EXISTS failure_details,
  DROP COLUMN IF EXISTS failure_stage,
  DROP COLUMN IF EXISTS failure_kind;
