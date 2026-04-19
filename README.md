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
| `npm run worker:dev` | Start the Playwright worker from the root repo |
| `npm run worker:build` | Build the worker package |
| `npm run worker:start` | Start the built worker package |
| `npm run smoke:dispatch-once` | Fetch one queued `audit.run` job and dispatch it to the worker |
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
worker/         Separate Node.js Playwright process (see worker/README.md)
migrations/     Reversible SQL migrations (up + down)
tests/          Unit and integration tests
public/         Static assets
```

## Architecture decisions

- **App runtime** (Next.js / Vercel): intake, job dispatch, report viewing.
- **Worker runtime** (separate Node.js process): all Playwright browser work.
- **Queue**: `pg-boss` behind `src/server/contracts/queue.ts`.
- **Storage**: local FS provider in worker (dev-only MVP), interface at `src/server/contracts/storage.ts`.
- **DB client / ORM**: raw `pg` client with raw SQL migrations in `migrations/`.
- **Evidence labels**: every finding is `Measured | Observed | Inferred`. Never present Inferred as Measured.

## Not yet implemented

- [x] Playwright worker
- [x] Worker processing (discovery, capture)
- [x] Deterministic evidence extraction + finding generation
- [x] Scoring + report view (`/report/[auditRunId]`)
- [ ] Real storage provider
- [x] LLM enrichment layer
- [ ] Auth / access control

## Shot 3 status

- Worker exists as a separate package under `worker/` using Playwright.
- Worker HTTP server (`npm run dev` in `worker/`) processes incoming `POST /capture` requests protected by HMAC.
- Discover up to 5 priority pages (homepage, about, services, contact, content).
- Stores page screenshots and HTML natively to `.storage/` artifact dir.
- Persists `page_snapshots` and orchestrates status (`discovering` → `capturing` → `complete`).

## Deploy smoke test

Current state is deploy-testable with one manual bridge: the app creates `audit.run` jobs in `pg-boss`, and
`npm run smoke:dispatch-once` drains one queued job and calls the worker. There is not yet an always-on queue
consumer in-repo.

App runtime envs:
- Required: `DATABASE_URL`
- Optional: `PG_BOSS_SCHEMA` (defaults to `pgboss`), `NEXT_PUBLIC_APP_URL`

Worker runtime envs:
- Required: `DATABASE_URL`, `WORKER_SECRET`
- Optional: `PORT` (defaults to `3001`)

Dispatch-shell envs:
- Required: `DATABASE_URL`, `WORKER_ENDPOINT`, `WORKER_SECRET`
- Optional: `PG_BOSS_SCHEMA` if not using the default `pgboss`

Vercel defaults are sufficient for the app deploy. No custom build override or `vercel.json` is required by the current repo.
The intake flow does not require a live worker to create an audit run; it only requires Postgres and `pg-boss` connectivity.

1. Deploy the Next.js app to Vercel with `DATABASE_URL` set.
2. Apply DB migrations against the production database:

   ```sh
   DATABASE_URL=postgres://... npm run migrate:up
   ```

3. Start the worker on a separate Node host from `worker/`.
   The host must support Playwright and provide a writable filesystem for the current local `.storage/` artifacts path.

   ```sh
   cd worker
   npm install
   npm run build
   DATABASE_URL=postgres://... \
   WORKER_SECRET=... \
   PORT=3001 \
   npm run start
   ```

   Optional sanity check:

   ```sh
   curl http://127.0.0.1:3001/health
   ```

4. Submit a real domain on `/intake` in the Vercel app and capture the returned `auditRunId`.
5. From a shell with production env vars, dispatch the queued job to the worker:

   ```sh
   DATABASE_URL=postgres://... \
   WORKER_ENDPOINT=https://your-worker-host \
   WORKER_SECRET=... \
   npm run smoke:dispatch-once
   ```

6. Success signals:
   - `/intake` shows `Audit job created.`
   - `smoke:dispatch-once` prints `jobId`, request payload, and worker response JSON
   - `audit_runs.status` moves from `pending` to `discovering`/`capturing` and finally `complete` or `failed`
- `page_snapshots` contains rows for the processed run when the worker captured at least the homepage

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

7. Failure signals:
   - `/intake` redirects with a queueing error and `status=failed`
   - `smoke:dispatch-once` reports no queued `audit.run` job
   - worker `/capture` returns non-200, `401`, or `Missing DATABASE_URL`
   - `audit_runs` remains `pending`, which means the manual bridge never drained the queue

## Shot 6 status

- `POST /api/reports/[auditRunId]/enrich` loads persisted findings/scores and calls Gemini to produce: executive summary, quick wins, cold email draft, collaboration angle, and Loom script notes.
- Generated assets are stored in `outreach_assets` (upsert-safe) and displayed in the report page when present.
- Deterministic report remains source of truth. LLM enrichment is additive and opt-in.
- `GEMINI_API_KEY` is optional. Missing key returns 503 from the enrich route and hides the enrichment section from the report page — base report is unaffected.
- `GEMINI_MODEL` is optional and defaults to `gemini-2.5-flash`.
- Operational smoke testing is still pending; the MVP is not operationally validated yet.

See `plan.md` for the milestone roadmap.
