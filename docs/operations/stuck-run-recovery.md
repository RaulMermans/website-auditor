# Stuck Run Recovery Policy

This is a diagnostic policy for future operator tooling. It does not authorize
destructive repair actions.

1. Find audit runs that have stayed in `capturing` for more than 30 minutes.
2. Inspect the latest `audit_run_attempts` entry and page snapshot state.
3. If no worker attempt exists and the run still has queued/capturing pages, retry
   the worker once through the normal `/api/worker/process` path.
4. If a worker attempt exists but the same page remains stuck after one retry,
   mark the run terminal `failed` with a limitation note explaining that capture
   did not complete.
5. Never delete artifacts, reset jobs, bypass target protection, or force rerun
   unbounded capture as part of stuck-run recovery.

Suggested read-only diagnostic query:

```sql
SELECT
  ar.id,
  td.domain,
  ar.status,
  ar.started_at,
  MAX(ara.created_at) AS last_attempt_at,
  COUNT(ps.id) FILTER (WHERE ps.page_state IN ('queued', 'capturing')) AS pending_pages
FROM audit_runs ar
JOIN target_domains td ON td.id = ar.target_domain_id
LEFT JOIN page_snapshots ps ON ps.audit_run_id = ar.id
LEFT JOIN audit_run_attempts ara ON ara.audit_run_id = ar.id
WHERE ar.status = 'capturing'
  AND ar.started_at < NOW() - INTERVAL '30 minutes'
GROUP BY ar.id, td.domain, ar.status, ar.started_at
ORDER BY ar.started_at ASC;
```
