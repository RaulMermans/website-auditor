# Scratchpad

Use this file for working notes, open questions, and decisions in flight.
Archive or delete entries once resolved.

---

## Open decisions

### Storage provider
- Options: Vercel Blob, AWS S3, Cloudflare R2
- Constraint: artifacts must be access-controlled (no raw public URLs)
- Currently resolved for Shot 3: using local `.storage` filesystem provider to unblock development while maintaining the abstract interface. Real provider required later.

---

## Notes

- Shot 2 decisions resolved: raw `pg` for Postgres access, `pg-boss` for queue dispatch.
- Intake persists `target_domains` and `audit_runs` before enqueue; enqueue failure marks the run `failed`.
- Shot 2.5 adds a disposable-DB integration proof: real migration + real persistence + real `pg-boss` enqueue via `TEST_DATABASE_URL`.
- Vercel-only pivot: intake now schedules audit processing from inside the app project with `after(...)`.
- External worker envs (`WORKER_ENDPOINT`, `WORKER_SECRET`) are removed from the app contract.
- Evidence label discipline: every Finding must set label at creation time, not retroactively.
- Playwright capture, snapshot persistence, and deterministic analysis now run through app-side server modules.
- Operational smoke testing remains pending, so the MVP is not operationally validated yet.
- The production intake flow is currently failing at runtime, so deployed smoke validation remains unresolved.
- Shot 4 can proceed against stored snapshot artifacts despite that, but runtime validation is still a later gate.
- Shot 5 adds scoring and report view. Scores are computed from DB findings at render time; no storage reads. Operational smoke testing remains pending — the MVP is still not operationally validated.
- Shot 6 adds LLM enrichment and outreach assets on top of deterministic report data. Enrichment is opt-in (POST /api/reports/[id]/enrich). GEMINI_API_KEY is optional; missing key degrades gracefully. Deterministic report is always source of truth. Operational smoke testing remains pending.

---

## Shot 7 runtime + dashboard status (2026-04-19)

### Changes applied
1. `launchBrowser()` — `PLAYWRIGHT_BROWSERS_PATH` is now always set to `"0"` (not conditional), and the launch call adds `--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage`. These flags are required on Vercel Lambda where Chrome runs as root and `/dev/shm` is constrained.
2. `export const maxDuration = 300` added to `src/app/intake/page.tsx`. Without this, Vercel's default 10 s timeout kills the `after()` Playwright callback before capture can complete.
3. `listRecentAuditRuns(limit?)` added to `src/db/report.ts` — joins `audit_runs` + `target_domains`, orders by `created_at DESC`, returns `AuditRunListItem[]`.
4. `src/app/audits/page.tsx` — server component, `force-dynamic`, reads from DB, shows status badges, failure reasons, report links.
5. `src/app/page.tsx` — links to `/audits`.
6. All 63 tests pass; build passes; lint clean.

### Still pending
- Live Vercel smoke run with `DATABASE_URL` + `npm run migrate:up` applied against production DB.
- Real blob storage provider (currently local FS, not viable for production Vercel artifacts).
- Confirm `maxDuration = 300` is within the active Vercel plan's allowed limit (Pro = 300 s, Hobby = 60 s).

---

## Shot 8 — Browser runtime fix (2026-04-19)

Replaced `playwright` + `scripts/install-playwright.mjs` postinstall with `@sparticuz/chromium@^147` + `playwright-core@^1.59.1`. Root cause: bundled Playwright browser was compiled against glibc/libraries not present in Vercel Lambda; `@sparticuz/chromium` ships a Lambda-compatible binary that extracts to `/tmp` at runtime, solving the `libnspr4.so` error. `postinstall` script and install-playwright.mjs are gone. All 63 tests pass, build clean.

## Vercel-only pivot status (2026-04-19)

**Implementation status: code path complete, operational smoke validation pending**

### Current assessment
1. App deploy path no longer depends on an external worker host, worker URL, or worker secret.
2. Intake now creates the audit run, enqueues `audit.run`, and schedules processing inside the same Vercel project.
3. Capture still persists `page_snapshots`, then deterministic analysis writes `page_evidence` and `findings`.
4. App deploy path is still Vercel-ready with defaults:
   `DATABASE_URL` is required; `PG_BOSS_SCHEMA`, `GEMINI_API_KEY`, `GEMINI_MODEL`, and `NEXT_PUBLIC_APP_URL` are part of the current app env contract.
5. `migrate:up` is repeatable against the same database with the current SQL files.
6. `test:integration` still requires an explicit disposable `TEST_DATABASE_URL`; it was not runnable in this audit shell without that env.

### Known gaps before production smoke test
1. **Production intake currently fails at runtime**: no successful deployed smoke run has been recorded yet, and the issue remains unresolved.
2. **Playwright on deployed Vercel server execution is not yet validated**: the code path exists, but runtime compatibility still needs a real smoke run.
3. **Storage is local FS only**: acceptable for local development, not a truthful long-term production artifact strategy on Vercel.
4. **Request-scoped trigger is the current async mechanism**: there is no separate always-on consumer, so failed request-after execution still needs operational validation.

### App layer env required at Vercel runtime
- `DATABASE_URL` — required; without it, intake action throws on first request
- `PG_BOSS_SCHEMA` — optional; defaults to `pgboss`
- `GEMINI_API_KEY` — optional; enables enrichment generation when present
- `GEMINI_MODEL` — optional; defaults to `gemini-2.5-flash`
- `NEXT_PUBLIC_APP_URL` — optional; used for links only
- `WORKER_SECRET` and `WORKER_ENDPOINT` are no longer part of the deployment contract

---

## Shot 10 — Agentic audit quality upgrade (2026-04-21)

### Explicit agentic workflow

```
Orchestrator      process-audit-run.ts           status transitions
Capture Agent     capture-audit-run.ts            Playwright → page_snapshots
Evidence Agent    extract-page-evidence.ts        DOM → page_evidence (deterministic)
Deduplication     deduplicate-findings.ts         merge by (category, title fingerprint)
Scoring           score-audit.ts                  penalty model + inspectedCategories
Report Assembly   db/report.ts + report page      coverage-aware display
Synthesis         generate-report-enrichment.ts   LLM downstream of deterministic data
```

### What changed

1. **`deduplicate-findings.ts` (new)**: collapses same-issue findings across pages into one, aggregates `pageUrls` on `evidenceRef`.
2. **`extract-page-evidence.ts`**: added trust signal detection, CTA inventory, form friction, messaging quality, script count. All new heuristics emit evidence items that mark categories as "inspected".
3. **`analyze-audit-run.ts`**: calls `deduplicateFindings()` before writing to DB.
4. **`score-audit.ts`**: `scoreAuditByCategory` now accepts `inspectedCategories?` and returns it on `CategoryScores`. Backward compatible — omitting the arg defaults to all categories inspected.
5. **`db/report.ts`**: loads distinct `category` from `page_evidence` and passes them to `scoreAuditByCategory`, enabling truthful "Not inspected" reporting.
6. **`generate-report-enrichment.ts`**: stronger synthesis prompt with explicit dedup, evidence-label, and scope constraints. `EnrichmentPromptInput` gains `inspectedCategories`.
7. **Report page**: category score cards show "—" and "Not inspected" for uninspected categories instead of false "100".

### Evidence categories now covered per page

| Category | Keys |
|---|---|
| technical_seo | title, meta_description, h1_count, internal/external links, canonical, robots_meta, heading_structure |
| accessibility | image_count, missing_alt_count |
| mobile_experience | viewport_meta_present |
| conversion | form_present, cta_present, button_count, cta_inventory, form_friction |
| messaging_content | page_text_flags, messaging_quality |
| trust_signals | trust_signals |
| performance | script_count |

`ux_ui` remains uninspected (needs visual/layout analysis beyond DOM — future work).

### Runtime validation debt (still pending)
- Vercel smoke run for end-to-end validation
- Real blob storage provider for production artifacts
- `ux_ui` category has no heuristics yet

---

## Shot 11 — Multi-specialist judgment pass (2026-04-21)

### What changed
1. Split finding logic into explicit evaluator modules under `src/server/audits/evaluators/`.
2. Added `prioritize-findings.ts` so report/enrichment inputs use a stable top-issues ordering instead of ad hoc severity sorting.
3. Strengthened deduplication to merge by deterministic issue fingerprint, not just normalized title. Merged findings now accumulate page URLs, page types, evidence keys, and the strongest representative severity/confidence.
4. Reworked scoring to use inspection depth plus finding confidence/evidence strength. Categories now resolve to `not_inspected`, `lightly_inspected`, or `inspected`, and scores cap below 100 even when no issues are found.
5. Report data now includes `topPriorities` and inspection summaries; the report page surfaces both.
6. Removed confirmed stale duplicate `* 2` files across source, tests, docs, and migrations.

### Verification
- `npm install` ✓
- `npm run lint` ✓
- `npm run typecheck` ✓
- `npm test` ✓
- `npm run test:coverage` ✓
- `npm run build` ✓

### Notes
- `ux_ui` remains a deliberate no-op evaluator for now because the current deterministic evidence set is DOM-first, not visual-layout aware.
- During verification, `npm run typecheck` initially failed because `.next/types/` contained stale numbered duplicates (`validator 5.ts`, `routes.d 10.ts`, etc.). Cleaning those generated artifacts and rerunning `next typegen` resolved the issue without changing product code.

## Shot 12 — Full report professionalization pass (2026-04-21)

### What changed
1. Added `src/server/audits/build-full-report.ts` to assemble a deterministic, client-readable report structure from existing findings, top priorities, scores, and inspection states.
2. Added `/report/[auditRunId]/full` as a long-form document route with executive summary, top priorities, score summary, category review, strategic readout, recommended next actions, and appendix/evidence notes.
3. Added `src/lib/report-presentation.ts` so both report routes share display helpers like category labels, score colors, support labels, and homepage-prefix stripping.
4. Tightened evaluator descriptions/recommendations for sharper, more professional stored finding copy without changing detection logic.
5. Added tests for full-report assembly and full-report route rendering.

### Notes
- Full report copy is deterministic. It summarizes and frames existing findings; it does not create new issues.
- Homepage-only scope remains explicit at the report level, but repeated `Homepage-only audit:` prefixes are stripped from rendered finding text for readability.
- Existing runtime/deployment architecture was left unchanged in this pass.

---

## Server-owned worker kickoff fix (2026-04-30, updated)

### Root cause
Audit runs were stuck `pending` indefinitely because the only kickoff path was
`IntakeSuccessTrigger` — a client component that fired `fetch('/api/worker/trigger')`
from a `useEffect`. If the browser tab was closed, JS blocked, or network flaky,
the job never started. A previous attempt using `after()` in the server action was
also unreliable in practice.

### Current implementation (inline server-side fetch, no after())

1. **`src/app/intake/actions.ts`** — after `createAuditJob()` succeeds, performs a
   direct `await fetch(workerUrl, { method: "POST", signal: AbortSignal.timeout(10_000) })`
   to `/api/worker/process` with the `x-worker-secret` header. Failure is caught and
   does not block the redirect. Logs: `[intake] worker trigger start` (with resolved URL),
   `[intake] worker trigger sent` (with response status), or `[intake] worker trigger failed`.
   URL resolution order: `process.env.APP_URL` → `VERCEL_URL` → `http://localhost:3000`.

2. **`src/app/api/worker/process/route.ts`** — inline `await dispatchAuditRun(...)` (no
   `after()`). Logs: `[worker/process] entered`, `auth pass/fail`, `queue fetch result`,
   `dispatch start`, `dispatch end / failure`. Returns 200/500 with full result.

3. **`src/components/intake-success-trigger.tsx`** — plain server component, no
   `useEffect`, no `useState`, no fetch. Shows domain, auditRunId, and report link.

### Kickoff flow
```
submitDomainAction()
  → createAuditJob() (enqueue pg-boss job)
  → await fetch('/api/worker/process', { 'x-worker-secret': ... })  ← server-side, inline
  → redirect('/intake?success=1&...')

POST /api/worker/process
  → [worker/process] entered / auth pass
  → queueClient.fetch('audit.run')     ← transitions job created → active
  → [worker/process] dispatch start
  → await dispatchAuditRun(...)        ← full audit runs inline, up to maxDuration=300s
  → [worker/process] dispatch end
  → return 200 completed
```

### Env vars for URL resolution
- `APP_URL` (new, server-side only): canonical base URL for worker self-call
- `VERCEL_URL` (Vercel-injected): fallback if APP_URL not set
- `http://localhost:3000`: final fallback for local dev

### Risks / follow-ups
- The 10s timeout on the intake action's fetch means: if the worker route takes >10s
  to respond (e.g. queue latency), the fetch will throw but the redirect still happens.
  The worker route continues independently once the Vercel function is invoked.
- `APP_URL` should be set in production Vercel env to the canonical deployment URL.
- The `/api/worker/trigger` route is retained for manual/debug use; no changes.
- Real blob storage provider is still pending for production artifacts.
