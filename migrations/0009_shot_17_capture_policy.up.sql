-- Shot 17: capture policy — add limitation_note to audit_runs for partial/degraded audit transparency.

ALTER TABLE audit_runs
  ADD COLUMN IF NOT EXISTS limitation_note TEXT;
