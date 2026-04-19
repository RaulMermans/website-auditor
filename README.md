# Website Audit Agent

Evidence-backed website audits. Rule-first, LLM-second. Fullstack Node.js + TypeScript on Vercel + Postgres.

## Local setup

```sh
cp .env.example .env.local   # fill in real values
npm install
npm run migrate:up:local     # apply Shot 2+3 tables in Postgres
npm run dev                  # http://localhost:3000
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run migrate:up` | Apply the Postgres migrations using ambient env vars |
| `npm run migrate:down` | Roll back the Postgres migrations using ambient env vars |
| `npm run migrate:up:local` | Apply the Postgres migrations from `.env.local` |
| `npm run migrate:down:local` | Roll back the Postgres migrations from `.env.local` |
| `npm run typecheck` | TypeScript check (no emit) |
| `npm test` | Run Vitest tests |
| `npm run test:integration` | Run the real Shot 2 Postgres + `pg-boss` proof |
| `npm run test:coverage` | Tests + coverage (80% target) |

## Repo structure

```
src/
  app/          Next.js App Router pages and layouts
  components/   UI components (intake, dashboard, report)
  lib/          Shared: types, env validation, utilities
  server/       Orchestration: job creation, contracts, scoring
  db/           Raw pg client + audit repositories
worker/         Internal Playwright package retained for dependency/runtime packaging notes
migrations/     Reversible SQL migrations (up + down)
tests/          Unit and integration tests
public/         Static assets
```

## Architecture decisions

- **App runtime** (Next.js / Vercel): intake, audit processing trigger, browser capture orchestration, report viewing.
- **Processing path**: `submitDomainAction()` creates the audit run, enqueues `audit.run`, then schedules in-project processing with `after(...)`.
- **Queue**: `pg-boss` behind `src/server/contracts/queue.ts`.
- **Storage**: local FS provider in the app runtime for now (dev-only MVP), interface at `src/server/contracts/storage.ts`.
- **DB client / ORM**: raw `pg` client with raw SQL migrations in `migrations/`.
- **Evidence labels**: every finding is `Measured | Observed | Inferred`. Never present Inferred as Measured.

## Not yet implemented

- [x] Playwright capture path
- [x] In-project processing (discovery, capture, analysis)
- [x] Deterministic evidence extraction + finding generation
- [x] Scoring + report view (`/report/[auditRunId]`)
- [ ] Real storage provider
- [x] LLM enrichment layer
- [ ] Auth / access control

## Shot 3 status

- Capture logic now runs through app-side server modules under `src/server/audits/`.
- Intake schedules processing from inside the Vercel project; no external worker host is required.
- Discover up to 5 priority pages (homepage, about, services, contact, content).
- Stores page screenshots and HTML natively to `.storage/` artifact dir.
- Persists `page_snapshots` and orchestrates status (`discovering` → `capturing` → `analyzing` → `complete`).

## Deploy smoke test

Current state is Vercel-only in code: the app creates `audit.run` jobs in `pg-boss` and schedules processing
from the same request lifecycle with `after(...)`. There is no external worker URL, shared secret, or second host.

App runtime envs:
- Required: `DATABASE_URL`
- Optional: `PG_BOSS_SCHEMA` (defaults to `pgboss`), `NEXT_PUBLIC_APP_URL`

Vercel defaults are sufficient for the app deploy. No custom build override or `vercel.json` is required by the current repo.
The Vercel build must include the workspace dependencies because Playwright still lives under `worker/package.json`.

1. Deploy the Next.js app to Vercel with `DATABASE_URL` set.
2. Apply DB migrations against the production database:

   ```sh
   DATABASE_URL=postgres://... npm run migrate:up
   ```

3. Submit a real domain on `/intake` in the Vercel app and capture the returned `auditRunId`.
4. Success signals:
   - `/intake` shows `Audit job created.`
   - `audit_runs.status` moves from `pending` to `discovering`/`capturing`/`analyzing` and finally `complete` or `failed`
   - `page_snapshots` contains rows for the processed run when capture succeeds
   - `findings` exists for the run and `/report/[auditRunId]` renders deterministic output

## Shot 4 status

- Stored HTML snapshots can now be analyzed into deterministic `page_evidence` and `findings` rows.
- Findings stay rule-first and carry severity, confidence, and `Measured | Observed | Inferred` labels.
- Homepage-only audit truth is preserved in generated finding copy and evidence refs.
- Operational smoke testing is still pending, so the MVP is not operationally validated yet.

## Shot 5 status

- Findings drive deterministic per-category and overall scores (`scoreAuditByCategory`).
- Report page at `/report/[auditRunId]` loads from DB: domain, run status, overall score, category score grid, findings grouped by category with evidence labels and recommendations.
- Homepage-only audits display a scope notice at the top of the report.
- No storage reads at report render time — findings are the only source of truth.
- Operational smoke testing is still pending; the MVP is not operationally validated yet.

5. Failure signals:
   - `/intake` redirects with a queueing error and `status=failed`
   - `audit_runs` remains `pending`, which means the request-scoped trigger did not run to completion
   - `audit_runs` moves to `failed` with a Playwright/runtime error before snapshots are written
   - `page_snapshots` is empty or `findings` never materialize for the run

## Shot 6 status

- `POST /api/reports/[auditRunId]/enrich` loads persisted findings/scores and calls Gemini to produce: executive summary, quick wins, cold email draft, collaboration angle, and Loom script notes.
- Generated assets are stored in `outreach_assets` (upsert-safe) and displayed in the report page when present.
- Deterministic report remains source of truth. LLM enrichment is additive and opt-in.
- `GEMINI_API_KEY` is optional. Missing key returns 503 from the enrich route and hides the enrichment section from the report page — base report is unaffected.
- `GEMINI_MODEL` is optional and defaults to `gemini-2.5-flash`.
- Operational smoke testing is still pending; the MVP is not operationally validated yet.

## Validation note

- Vercel-only processing is now the deployed architecture in code.
- Operational smoke validation on a real Vercel deployment is still pending.
- The biggest unresolved production risk is Playwright execution plus local filesystem artifact storage under Vercel server execution; the code path exists, but this has not yet been validated end to end.

See `plan.md` for the milestone roadmap.
