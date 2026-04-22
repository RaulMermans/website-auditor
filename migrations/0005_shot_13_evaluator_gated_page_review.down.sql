-- Revert Shot 13 evaluator gating metadata.

DROP INDEX IF EXISTS findings_audit_run_evaluator_status_idx;

ALTER TABLE findings
  DROP COLUMN IF EXISTS evaluator_notes,
  DROP COLUMN IF EXISTS evaluator_status,
  DROP COLUMN IF EXISTS support_type,
  DROP COLUMN IF EXISTS claim_posture;

ALTER TABLE page_snapshots
  DROP COLUMN IF EXISTS evaluator_status,
  DROP COLUMN IF EXISTS escalation_reason,
  DROP COLUMN IF EXISTS retry_count,
  DROP COLUMN IF EXISTS review_status;
