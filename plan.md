# Plan

## Shot 1 — Foundation (complete)

Scaffold, conventions, env validation, placeholder contracts, test framework, homepage shell.

AC: npm install ✓ | dev ✓ | build ✓ | lint ✓ | typecheck ✓ | test ✓ | homepage ✓

## Shot 2 — Domain intake + job creation (complete)

- DB client selection and first migration (projects, target_domains, audit_runs)
- `/intake` route: form accepting a domain, creates AuditRun in DB, enqueues job
- Queue provider wired (`pg-boss`)
- Tests: intake validation, DB persistence, queue enqueue

AC: user submits domain → AuditRun row in DB → job enqueued ✓

## Shot 2.5 — Integration proof (complete, gate before Shot 3)

- Disposable Postgres integration path applies the real Shot 2 migration
- `createAuditJob()` runs with the real repository and real `pg-boss` adapter
- Assertions prove `target_domains`, `audit_runs`, and queue job persistence

AC: `npm run test:integration` proves migration + persist + enqueue on real Postgres ✓

## Shot 3 — Capture pipeline pivoted to Vercel-only (complete in code, smoke validation pending)

- External worker HTTP dispatch has been removed from the app runtime.
- Intake still creates `audit.run` jobs, then schedules in-project processing via `after(...)`.
- Playwright: homepage capture, priority page discovery (up to 5 pages)
- Screenshots and HTML snapshots → app-side storage contract
- PageSnapshot rows persisted in DB
- Homepage-only fallback if discovery fails
- Real Vercel smoke validation is still pending, so Playwright execution under deployed server runtime is not yet operationally proven.

AC: app-side processing path exists in code; end-to-end Vercel smoke validation still pending

## Shot 4 — Evidence extraction + findings

- DOM evidence extraction rules (title, meta, headings, performance hints, broken links)
- PageEvidence rows persisted per rule
- Finding generation: rule-based first pass
- Evidence labels enforced (Measured / Observed / Inferred)
- Operational smoke test still pending; MVP is not operationally validated yet, but Shot 4 may proceed on stored snapshot inputs.

AC: findings exist in DB for an audited domain, all labeled

## Shot 5 — Scoring + report view (complete)

- `scoreAuditByCategory`: per-category + overall deterministic scores from findings
- `src/db/report.ts`: `ReportRepository` — loads audit run, domain, findings, computes scores
- `/report/[auditRunId]` page: domain, status, homepage-only notice, overall score, category grid, findings grouped by category with evidence labels and recommendations
- No storage reads at render time — findings are source of truth
- Operational smoke test still pending; MVP is not operationally validated yet

AC: shareable report URL with scored findings ✓

## Shot 6 — LLM enrichment + outreach asset (complete)

- `buildEnrichmentInput()` shapes deterministic findings/scores into compact LLM prompt input (pure)
- `generateReportEnrichment()` calls Gemini → executive summary + quick wins; returns null if key missing
- `generateOutreachAssets()` calls Gemini → cold email, collaboration angle, loom script; returns null if key missing
- `POST /api/reports/[auditRunId]/enrich` triggers generation and persists assets to `outreach_assets` table
- Report page displays enriched summary and assets if present in DB; degrades gracefully if absent
- Migration `0004` adds `outreach_assets` table with upsert-safe unique constraint
- Operational smoke testing still pending; MVP is not operationally validated yet

AC: outreach_asset rows in DB, viewable in report ✓

## Deferred decisions

| Decision | Status | Needed by |
|---|---|---|
| Queue provider | pg-boss | Resolved |
| Storage provider | Local FS (dev) | Shot 3 (resolved for local dev) |
| DB client / ORM | raw pg | Resolved |
| Auth / access control | Deferred | Post-MVP |
