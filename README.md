# Website Audit Agent

Internal prospect audit tool. Accepts a public website URL and produces an evidence-backed audit with deterministic scoring and persisted client-acquisition intelligence.

The audit engine is rule-first: findings are produced deterministically from captured evidence. Gemini is downstream synthesis only — it may interpret accepted findings but cannot create audit truth.

The repository is public for portfolio and reference purposes. The live Vercel deployment is private. No demo is exposed.

## Stack

Fullstack Node.js + TypeScript · Next.js App Router · Vercel · Postgres · pg-boss · Playwright + @sparticuz/chromium · Gemini

## Architecture

```
Intake (browser)
  └─► submitDomainAction()
        ├─► creates audit_run in Postgres
        ├─► enqueues audit.run job via pg-boss
        └─► triggers /api/worker/process server-side (event-driven)
              └─► capture pipeline (browser-first → static fallback)
                    ├─► page_snapshots + page_evidence (stored)
                    ├─► deterministic findings + category scores
                    └─► optional Gemini synthesis → prospect_intelligence
```

**Truth boundary:** The deterministic audit engine creates all findings and scores. The Prospect Audit Agent (`src/server/agents/`) reads only accepted evidence and may not accept/reject findings, score categories, or invent metrics or revenue claims.

**Capture fidelity:** Browser-first for homepage. Blocks and runtime failures downgrade to authorized public static evidence. No anti-bot bypass is implemented.

**Evidence labels:** Every finding carries `Measured | Observed | Inferred`. Inferred claims are never presented as measured facts.

**Report badges:** `rendered_browser + complete` → Rendered audit · `rendered_browser + partial_complete` → Mixed capture · `static_public` → Static fallback · `secondary_static` → Partial/static

**Worker:** Audit processing runs inside the Vercel app project. `.github/workflows/worker-drain.yml` is a manual-only emergency recovery action (`workflow_dispatch`) for stuck jobs — it is not scheduled.

**Manifests:** `workflow.yaml` documents the deterministic workflow and bounded LLM synthesis layer. `agents.yaml` documents the Prospect Audit Agent permissions, inputs, outputs, and forbidden behavior.

## Local setup

```sh
cp .env.example .env.local   # fill in real values — see .env.example for all vars
npm install
npm run migrate:up:local     # apply Postgres migrations from .env.local
npm run dev                  # http://localhost:3000
```

The access gate is open in local dev when `INTERNAL_ACCESS_COOKIE_SECRET` is not set.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check (no emit) |
| `npm test` | Vitest unit tests |
| `npm run test:coverage` | Tests + coverage (80% target) |
| `npm run migrate:up:local` | Apply migrations from `.env.local` |
| `npm run migrate:down:local` | Roll back migrations from `.env.local` |
| `npm run migrate:up:vercel:prod` | Pull Vercel production env, apply migrations |

## Repo structure

```
src/
  app/          Next.js App Router pages, layouts, route handlers
  components/   UI components (intake, dashboard, report)
  lib/          Shared: types, env validation, scoring helpers
  server/       Orchestration: job creation, capture, scoring, report assembly
  server/agents/ Prospect Audit Agent: prompt, schema, runner
  db/           Raw pg client + audit repositories
worker/         Legacy Playwright package (not a production dependency)
migrations/     Reversible SQL migrations
tests/          Unit, integration, and security tests
docs/agentic/   Architecture and prompt governance docs
public/         Static assets
```

## Access control

The repository is public. The deployed Vercel app is not — no live demo is exposed.

**How it works:**

- `src/middleware.ts` guards every request to protected routes.
- Valid access is a 30-day HMAC-SHA256-signed `ia_session` cookie, issued at `/internal-login` after the correct password is entered.
- `/api/worker/process` is exempt from the cookie gate and uses its own `WORKER_SECRET` header check.
- `/` is a public landing page that shows a sign-in link only.

**Protected routes:**

| Route | Guard |
|---|---|
| `/intake` | Session cookie |
| `/audits` | Session cookie |
| `/report/:path*` | Session cookie |
| `/api/audits/:path*` | Session cookie |
| `/api/reports/:path*` | Session cookie |
| `/api/worker/:path*` | Session cookie |
| `/api/worker/process` | `WORKER_SECRET` header (cookie exempt) |

**Public routes:** `/`, `/internal-login`, `/internal-logout`, `/_next/*`, `/favicon.ico`, `/robots.txt`, `/sitemap.xml`

## Environment variables

All variables are documented in `.env.example` with placeholder values only. Required in production:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `WORKER_SECRET` | Auth header for `/api/worker/process` (≥16 chars) |
| `AUDIT_API_KEY` | Auth for report enrichment routes (≥16 chars) |
| `INTERNAL_ACCESS_PASSWORD` | Password for `/internal-login` (≥8 chars) |
| `INTERNAL_ACCESS_COOKIE_SECRET` | HMAC signing key for session cookie (≥32 chars) |
| `GEMINI_API_KEY` | Gemini API key for Prospect Audit Agent synthesis |

Optional: `GEMINI_MODEL` (defaults to `gemini-2.5-flash`), `STORAGE_PROVIDER` (`local` or `vercel_blob`), `BLOB_READ_WRITE_TOKEN`, `BROWSER_DRIVER` (`playwright` or `browser_use`), `APP_URL`, `NEXT_PUBLIC_APP_URL`.

Generate `INTERNAL_ACCESS_COOKIE_SECRET`:
```sh
openssl rand -base64 32
```

## Deployment

Vercel-only. Intake triggers audit processing inside the same app project — no external worker host required.

Migrations do not run automatically on deploy. Apply them manually:
```sh
npm run migrate:up:vercel:prod
```

## Known limitations

- Production private artifact storage (Vercel Blob) still needs access-control validation.
- Static-only and secondary-static reports intentionally exclude visual/mobile/above-the-fold scoring.
- Prospect Intelligence is internal prospecting guidance, not audit truth.
- End-to-end operational smoke validation on a live Vercel deployment is still pending.
