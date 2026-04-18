CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS target_domains (
  id UUID PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_runs (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  target_domain_id UUID NOT NULL REFERENCES target_domains(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'failed')),
  homepage_only BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_runs_target_domain_id_idx
  ON audit_runs (target_domain_id);

CREATE INDEX IF NOT EXISTS audit_runs_status_idx
  ON audit_runs (status);
