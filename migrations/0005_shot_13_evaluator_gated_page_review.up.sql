-- Shot 13: add page-review gating metadata and evaluator-calibrated findings.

ALTER TABLE page_snapshots
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'queued'
  CHECK (review_status IN ('queued', 'capturing', 'auditing', 'evaluating', 'accepted', 'needs_review', 'failed')),
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0
  CHECK (retry_count >= 0),
  ADD COLUMN IF NOT EXISTS escalation_reason TEXT,
  ADD COLUMN IF NOT EXISTS evaluator_status TEXT NOT NULL DEFAULT 'queued'
  CHECK (evaluator_status IN ('queued', 'evaluating', 'accepted', 'needs_review', 'failed'));

ALTER TABLE findings
  ADD COLUMN IF NOT EXISTS claim_posture TEXT NOT NULL DEFAULT 'observed_pattern'
  CHECK (claim_posture IN ('confirmed', 'observed_pattern', 'directional')),
  ADD COLUMN IF NOT EXISTS support_type TEXT NOT NULL DEFAULT 'dom'
  CHECK (support_type IN ('dom', 'cross_page', 'inferred')),
  ADD COLUMN IF NOT EXISTS evaluator_status TEXT NOT NULL DEFAULT 'accepted'
  CHECK (evaluator_status IN ('accepted', 'needs_review')),
  ADD COLUMN IF NOT EXISTS evaluator_notes TEXT;

UPDATE page_snapshots ps
SET
  review_status = CASE
    WHEN EXISTS (SELECT 1 FROM findings f WHERE f.page_snapshot_id = ps.id) THEN 'accepted'
    ELSE 'capturing'
  END,
  evaluator_status = CASE
    WHEN EXISTS (SELECT 1 FROM findings f WHERE f.page_snapshot_id = ps.id) THEN 'accepted'
    ELSE 'queued'
  END,
  retry_count = 0,
  escalation_reason = NULL;

UPDATE findings
SET
  claim_posture = CASE evidence_level
    WHEN 'Measured' THEN 'confirmed'
    WHEN 'Observed' THEN 'observed_pattern'
    ELSE 'directional'
  END,
  support_type = CASE
    WHEN evidence_level = 'Inferred' THEN 'inferred'
    WHEN COALESCE(NULLIF(evidence_ref ->> 'pageCount', '')::INTEGER, CASE WHEN evidence_ref ? 'pageUrl' THEN 1 ELSE 0 END) > 1 THEN 'cross_page'
    ELSE 'dom'
  END,
  evaluator_status = 'accepted',
  evaluator_notes = NULL;

CREATE INDEX IF NOT EXISTS findings_audit_run_evaluator_status_idx
  ON findings (audit_run_id, evaluator_status);
