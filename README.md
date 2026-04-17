# Website Audit Agent

Evidence-backed website audits. Rule-first, LLM-second. Fullstack Node.js + TypeScript on Vercel + Postgres.

## Local setup

```sh
cp .env.example .env.local   # fill in real values
npm install
npm run dev                  # http://localhost:3000
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check (no emit) |
| `npm test` | Run Vitest tests |
| `npm run test:coverage` | Tests + coverage (80% target) |

## Repo structure

```
src/
  app/          Next.js App Router pages and layouts
  components/   UI components (intake, dashboard, report)
  lib/          Shared: types, env validation, utilities
  server/       Orchestration: job creation, contracts, scoring
  db/           Schema placeholder; DB client TBD
worker/         Separate Node.js Playwright process (see worker/README.md)
migrations/     Reversible SQL migrations (up + down)
tests/          Unit and integration tests
public/         Static assets
```

## Architecture decisions

- **App runtime** (Next.js / Vercel): intake, job dispatch, report viewing.
- **Worker runtime** (separate Node.js process): all Playwright browser work.
- **Queue**: provider TBD — interface at `src/server/contracts/queue.ts`.
- **Storage**: provider TBD — interface at `src/server/contracts/storage.ts`.
- **DB client / ORM**: TBD — raw SQL migrations in `migrations/`. Schema shape in `src/db/schema.ts`.
- **Evidence labels**: every finding is `Measured | Observed | Inferred`. Never present Inferred as Measured.

## Not yet implemented

- [ ] Audit pipeline (discovery, capture, analysis)
- [ ] Playwright worker
- [ ] Real queue provider
- [ ] Real storage provider
- [ ] DB client and migrations
- [ ] Dashboard and report UI
- [ ] LLM enrichment layer
- [ ] Auth / access control

See `plan.md` for the milestone roadmap.
