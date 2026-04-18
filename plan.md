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

## Shot 3 — Worker: discovery + capture

- Worker HTTP server (`worker/src/index.ts`)
- Playwright: homepage capture, priority page discovery (up to 5 pages)
- Screenshots and HTML snapshots → blob storage
- PageSnapshot rows persisted in DB
- Homepage-only fallback if discovery fails

AC: worker processes a real domain → snapshots in storage + DB

## Shot 4 — Evidence extraction + findings

- DOM evidence extraction rules (title, meta, headings, performance hints, broken links)
- PageEvidence rows persisted per rule
- Finding generation: rule-based first pass
- Evidence labels enforced (Measured / Observed / Inferred)

AC: findings exist in DB for an audited domain, all labeled

## Shot 5 — Scoring + report view

- Rubric entity + scorecard computation
- `/report/[auditRunId]` page: findings, scores, recommendations
- Quick wins list (high-impact / low-effort recommendations)

AC: shareable report URL with scored findings

## Shot 6 — LLM enrichment + outreach asset

- LLM pass over stored evidence (Anthropic API, rule-first constraint)
- Outreach email draft generation
- Proposal summary generation

AC: outreach_asset rows in DB, viewable in report

## Deferred decisions

| Decision | Status | Needed by |
|---|---|---|
| Queue provider | pg-boss | Resolved |
| Storage provider | TBD | Shot 3 |
| DB client / ORM | raw pg | Resolved |
| Auth / access control | Deferred | Post-MVP |
