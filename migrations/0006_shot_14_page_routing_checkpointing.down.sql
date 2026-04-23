-- Revert Shot 14 routing/checkpointing and finding review changes.

DROP INDEX IF EXISTS findings_audit_run_review_status_idx;

ALTER TABLE findings
  DROP CONSTRAINT IF EXISTS findings_review_status_check;

ALTER TABLE findings
  DROP COLUMN IF EXISTS review_reason,
  DROP COLUMN IF EXISTS review_status;

DROP INDEX IF EXISTS page_snapshots_audit_run_state_priority_idx;

UPDATE page_snapshots
SET page_type = CASE page_type
  WHEN 'pricing' THEN 'services'
  WHEN 'product' THEN 'services'
  WHEN 'form' THEN 'contact'
  WHEN 'blog_article' THEN 'content'
  WHEN 'legal' THEN 'other'
  ELSE page_type
END;

DELETE FROM page_snapshots
WHERE html_storage_key IS NULL
  AND screenshot_storage_key IS NULL;

UPDATE page_snapshots
SET captured_at = COALESCE(captured_at, NOW())
WHERE captured_at IS NULL;

ALTER TABLE page_snapshots
  DROP CONSTRAINT IF EXISTS page_snapshots_page_state_check;

ALTER TABLE page_snapshots
  DROP CONSTRAINT IF EXISTS page_snapshots_page_type_check;

ALTER TABLE page_snapshots
  DROP COLUMN IF EXISTS last_error,
  DROP COLUMN IF EXISTS page_state,
  DROP COLUMN IF EXISTS page_priority;

ALTER TABLE page_snapshots
  ALTER COLUMN captured_at SET NOT NULL;

ALTER TABLE page_snapshots
  ADD CONSTRAINT page_snapshots_page_type_check
  CHECK (page_type IN ('homepage', 'about', 'services', 'contact', 'content', 'other'));
