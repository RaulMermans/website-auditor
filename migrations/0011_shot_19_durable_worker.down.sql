DROP TABLE IF EXISTS audit_run_attempts;

ALTER TABLE audit_runs DROP CONSTRAINT IF EXISTS audit_runs_status_check;

ALTER TABLE audit_runs ADD CONSTRAINT audit_runs_status_check CHECK (
  status IN (
    'pending',
    'discovering',
    'capturing',
    'analyzing',
    'complete',
    'failed'
  )
);
