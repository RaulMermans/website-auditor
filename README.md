# Website Audit Agent

Evidence-backed website audits. Rule-first, LLM-second. Fullstack Node.js + TypeScript on Vercel + Postgres.

## Local setup

```sh
cp .env.example .env.local   # fill in real values
npm install
npm run migrate:up           # apply Shot 2+3 tables in Postgres
npm run dev                  # http://localhost:3000
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run migrate:up` | Apply the Postgres migrations |
| `npm run migrate:down` | Roll back the Postgres migrations |
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
- Worker CLI (`npm run dev` in `worker/`) processes a single `auditRunId` + `domain`.
- Discover up to 5 priority pages (homepage, about, services, contact, content).
- Stores page screenshots and HTML natively to `.storage/` artifact dir.
- Persists `page_snapshots` and orchestrates status (`discovering` → `capturing` → `complete`).

See `plan.md` for the milestone roadmap.
