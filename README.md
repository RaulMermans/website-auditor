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
- [ ] Real storage provider
- [ ] Audit pipeline (analysis)
- [ ] Dashboard and report UI
- [ ] LLM enrichment layer
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

1. Deploy the Next.js app to Vercel with `DATABASE_URL` set. `PG_BOSS_SCHEMA` is optional and defaults to `pgboss`.
2. Apply DB migrations against the production database:

   ```sh
   DATABASE_URL=postgres://... npm run migrate:up
   ```

3. Deploy the worker separately from `worker/` with `DATABASE_URL` and `WORKER_SECRET` set:

   ```sh
   cd worker
   npm install
   npm run build
   PORT=3001 npm run start
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
   - `/intake` shows `Audit job created`
   - `smoke:dispatch-once` prints the queued payload and worker response JSON
   - `audit_runs.status` becomes `complete` or `failed`
   - `page_snapshots` contains rows for the processed run

7. Failure signals:
   - intake redirect with queueing error
   - `smoke:dispatch-once` reports no queued `audit.run` job
   - worker returns non-200 / HMAC error / missing `DATABASE_URL`
   - `audit_runs` remains `pending`

See `plan.md` for the milestone roadmap.
