-- Widen audit_runs.status CHECK to include new terminal states.
-- partial_complete: homepage captured but some secondary pages failed or need review.
-- needs_human_review: multiple pages need manual verification before the run is trusted.

ALTER TABLE audit_runs DROP CONSTRAINT IF EXISTS audit_runs_status_check;

ALTER TABLE audit_runs ADD CONSTRAINT audit_runs_status_check CHECK (
  status IN (
    'pending',
    'discovering',
    'capturing',
    'analyzing',
    'partial_complete',
    'needs_human_review',
    'complete',
    'failed'
  )
);

-- Attempt log for capture, analysis, and LLM validation retries.
-- Provides lightweight traceability for deterministic retry decisions.
CREATE TABLE IF NOT EXISTS audit_run_attempts (
  id UUID PRIMARY KEY,
  audit_run_id UUID NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  page_snapshot_id UUID REFERENCES page_snapshots(id) ON DELETE SET NULL,
  stage TEXT NOT NULL CHECK (stage IN ('discover', 'capture', 'analyze', 'enrich')),
  attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt >= 1 AND attempt <= 2),
  failure_kind TEXT,
  evaluator_feedback TEXT,
  next_retry_strategy TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_run_attempts_run_idx
  ON audit_run_attempts (audit_run_id);

CREATE INDEX IF NOT EXISTS audit_run_attempts_snapshot_idx
  ON audit_run_attempts (page_snapshot_id)
  WHERE page_snapshot_id IS NOT NULL;
