-- Reverse Shot 17: remove limitation_note from audit_runs.

ALTER TABLE audit_runs
  DROP COLUMN IF EXISTS limitation_note;
