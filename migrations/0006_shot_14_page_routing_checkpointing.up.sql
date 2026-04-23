-- Shot 14: first-class page routing, checkpointed page states, and finding review status.
-- This migration layers on top of Shot 13 page review gating.

ALTER TABLE page_snapshots
  DROP CONSTRAINT IF EXISTS page_snapshots_page_type_check;

ALTER TABLE page_snapshots
  ADD COLUMN IF NOT EXISTS page_priority INTEGER NOT NULL DEFAULT 999,
  ADD COLUMN IF NOT EXISTS page_state TEXT NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS last_error TEXT;

ALTER TABLE page_snapshots
  ALTER COLUMN captured_at DROP NOT NULL;

ALTER TABLE page_snapshots
  DROP CONSTRAINT IF EXISTS page_snapshots_page_state_check;

ALTER TABLE page_snapshots
  ADD CONSTRAINT page_snapshots_page_state_check
  CHECK (
    page_state IN (
      'queued',
      'capturing',
      'captured',
      'auditing',
      'evaluating',
      'accepted',
      'needs_review',
      'failed'
    )
  );

ALTER TABLE page_snapshots
  DROP CONSTRAINT IF EXISTS page_snapshots_retry_count_check;

ALTER TABLE page_snapshots
  ADD CONSTRAINT page_snapshots_retry_count_check
  CHECK (retry_count >= 0);

ALTER TABLE page_snapshots
  ADD CONSTRAINT page_snapshots_page_type_check
  CHECK (
    page_type IN (
      'homepage',
      'pricing',
      'product',
      'about',
      'services',
      'contact',
      'form',
      'blog_article',
      'legal',
      'content',
      'other'
    )
  );

UPDATE page_snapshots
SET page_priority = CASE page_type
  WHEN 'homepage' THEN 0
  WHEN 'pricing' THEN 10
  WHEN 'product' THEN 20
  WHEN 'services' THEN 30
  WHEN 'about' THEN 40
  WHEN 'contact' THEN 50
  WHEN 'form' THEN 60
  WHEN 'blog_article' THEN 70
  WHEN 'content' THEN 70
  WHEN 'legal' THEN 80
  ELSE 90
END
WHERE page_priority = 999;

UPDATE page_snapshots
SET page_state = CASE
  WHEN html_storage_key IS NOT NULL THEN 'captured'
  ELSE 'queued'
END
WHERE page_state = 'queued';

CREATE INDEX IF NOT EXISTS page_snapshots_audit_run_state_priority_idx
  ON page_snapshots (audit_run_id, page_state, page_priority, url);

ALTER TABLE findings
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'accepted',
  ADD COLUMN IF NOT EXISTS review_reason TEXT;

ALTER TABLE findings
  DROP CONSTRAINT IF EXISTS findings_review_status_check;

ALTER TABLE findings
  ADD CONSTRAINT findings_review_status_check
  CHECK (review_status IN ('accepted', 'needs_review'));

CREATE INDEX IF NOT EXISTS findings_audit_run_review_status_idx
  ON findings (audit_run_id, review_status);
