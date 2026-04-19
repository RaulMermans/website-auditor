-- Revert Shot 4 evidence and finding tables.

DROP INDEX IF EXISTS findings_page_snapshot_id_idx;
DROP INDEX IF EXISTS findings_audit_run_id_idx;
DROP TABLE IF EXISTS findings;

DROP INDEX IF EXISTS page_evidence_page_snapshot_id_idx;
DROP INDEX IF EXISTS page_evidence_audit_run_id_idx;
DROP TABLE IF EXISTS page_evidence;
