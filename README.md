# Website Audit Agent

Evidence-backed website audits. Rule-first, LLM-second. Fullstack Node.js + TypeScript on Vercel + Postgres.

## Local setup

```sh
cp .env.example .env.local   # fill in real values
npm install
npm run migrate:up           # apply Shot 2 tables in Postgres
npm run dev                  # http://localhost:3000
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run migrate:up` | Apply the Shot 2 Postgres migration |
| `npm run migrate:down` | Roll back the Shot 2 Postgres migration |
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
- **Storage**: provider TBD — interface at `src/server/contracts/storage.ts`.
- **DB client / ORM**: raw `pg` client with raw SQL migrations in `migrations/`.
- **Evidence labels**: every finding is `Measured | Observed | Inferred`. Never present Inferred as Measured.

## Not yet implemented

- [ ] Audit pipeline (discovery, capture, analysis)
- [ ] Playwright worker
- [ ] Worker processing
- [ ] Real storage provider
- [ ] Dashboard and report UI
- [ ] LLM enrichment layer
- [ ] Auth / access control

## Shot 2 status

- `/intake` validates and normalizes domains before job creation.
- `target_domains` and `audit_runs` persist in Postgres before enqueue.
- Queue dispatch uses `pg-boss` and lazily creates the queue on first enqueue.
- On enqueue failure, the persisted audit run is marked `failed`.
- `npm run test:integration` is the gate proving migration + persistence + enqueue against a disposable Postgres DB via `TEST_DATABASE_URL`.

See `plan.md` for the milestone roadmap.
