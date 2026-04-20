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
- The production intake flow is currently failing at runtime, so the deploy smoke gate remains unresolved.
- Playwright: homepage capture, priority page discovery (up to 5 pages)
- Screenshots and HTML snapshots → app-side storage contract
- PageSnapshot rows persisted in DB
- Homepage-only fallback if discovery fails
- Real Vercel smoke validation is still pending, so Playwright execution under deployed server runtime is not yet operationally proven.

AC: app-side processing path exists in code; production intake/runtime smoke validation still pending

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

## Shot 7 — Runtime fixes + audits dashboard (complete)

- Fixed `launchBrowser()`: always sets `PLAYWRIGHT_BROWSERS_PATH=0`; adds `--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage` args for Lambda compatibility.
- Added `export const maxDuration = 300` to the intake route so Vercel keeps the `after()` callback alive for up to 5 minutes.
- `listRecentAuditRuns()` added to `src/db/report.ts`; returns 50 most recent runs with domain, status, timestamps, homepage_only, failure_reason.
- `/audits` page lists audit runs with status badges; failed runs show failure_reason; complete runs link to report.
- Home page now links to `/audits`.
- All 63 tests pass; 4 new tests for `AuditRunListItem` shape.
- Operational smoke validation still pending; next step is a live Vercel deploy run.

AC: AC1 ✓ AC2 ✓ AC3 ✓ AC4 ✓ AC5 ✓ AC6 ✓ AC7 ✓ AC8 ✓ AC9 ✓ AC10 ✓

## Shot 8 — Vercel-compatible browser runtime (complete)

- Replaced `playwright` + `scripts/install-playwright.mjs` postinstall with `@sparticuz/chromium@^147` + `playwright-core@^1.59.1`.
- `@sparticuz/chromium` bundles a Lambda-compatible Chromium binary (no missing shared-lib errors); extracts to `/tmp` at runtime.
- `launchBrowser()` now uses `chromium.executablePath()` from `@sparticuz/chromium` and `playwright-core` for automation.
- `next.config.ts`: added `serverExternalPackages`, updated `outputFileTracingIncludes` to `@sparticuz/chromium/bin/**/*`.
- `scripts/install-playwright.mjs` deleted; `postinstall` script removed from `package.json`.
- All 63 tests pass; typecheck, lint, and build clean.

AC1 ✓ AC2 ✓ AC3 ✓ AC4 ✓ AC5 ✓ AC6 ✓

## Shot 9 — Remove stale Playwright workspace (complete)

- `worker/` removed from root `package.json` `workspaces` array.
- `playwright` (full package) no longer installed at root `node_modules` during build.
- `node_modules/playwright-core/.local-browsers/` no longer populated; stale directory deleted.
- Lockfile regenerated; worker entry marked `"extraneous": true` — Vercel `npm ci` skips it.
- All 63 tests pass; typecheck, lint, and build clean.
- **Must redeploy without cache** for the change to take effect on Vercel.

AC: no `playwright` in root `node_modules`; no `.local-browsers/` on build; browser launch uses `@sparticuz/chromium` exclusively ✓

## Deferred decisions

| Decision | Status | Needed by |
|---|---|---|
| Queue provider | pg-boss | Resolved |
| Storage provider | Local FS (dev) / /tmp (Vercel) | Shot 3 (resolved for Vercel & local) |
| DB client / ORM | raw pg | Resolved |
| Auth / access control | Deferred | Post-MVP |
