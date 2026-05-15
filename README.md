# Website Audit Agent

Internal Prospect Audit Agent for Raul. Evidence-backed website audits, deterministic scoring, and LLM-assisted client-acquisition intelligence. Rule-first, LLM-second. Fullstack Node.js + TypeScript on Vercel + Postgres.

## Current status

- Vercel-only processing is the intended architecture in code; intake triggers audit processing inside the app project.
- Deterministic findings and scores remain the source of truth; Gemini enrichment and Prospect Intelligence are downstream synthesis only.
- The audit engine is deterministic. LLMs may synthesize accepted evidence but must not create audit truth.
- Capture is browser-first for the homepage. Browser blocks/runtime failures downgrade to authorized public static evidence or bounded secondary static sweep; no anti-bot bypass is implemented.
- `workflow.yaml` and `agents.yaml` are the canonical machine-readable architecture manifests for static auditors and agent/workflow scanners.
- Prospect Intelligence is persisted in `prospect_intelligence` and displayed in the internal report UI when generated.
- `/audits` dashboard lists recent audit runs with status, failure reasons, and links to reports.
- Report experience now has both a concise operational view (`/report/[auditRunId]`) and a long-form document view (`/report/[auditRunId]/full`).
- Runtime blockers addressed: Lambda-compatible browser launch args + `maxDuration = 300` on the intake route.
- Operational smoke validation is still pending on Vercel; end-to-end proof requires a live deploy run.

### Completion policy (since v0.2)
- Secondary page review-gate failures produce `partial_complete` — not `needs_human_review` — when at least one high-priority page (homepage, contact, services, pricing) was accepted.
- Only high-priority-page review conflicts, all-legal-only-accepted, or majority-failed scenarios escalate to `needs_human_review`.
- Rejected/needs_review page findings are excluded from scores and report conclusions. Evidence Notes lists excluded pages with URLs, page types, and escalation reasons.
- Blocked-target captures are expected handled terminal states, not generic server crashes. The UI labels them as automated capture blocked and points operators to start another audit.

### Static fallback language (since v0.2)
- For `static`, `fallback_static`, and `secondary_static` captures, technical SEO finding titles and report copy use bounded language ("not detected in captured static HTML") rather than definitive "Missing" language. Secondary-static reports use "captured secondary static HTML" and old persisted findings are calibrated at report time.
- Homepage-failed secondary-static audits lower confidence for brand clarity, conversion path, trust/proof, experience flow, and mobile experience. Uninspected categories are unknown, not clean.

### Audit progress UX (since v0.2)
- After submitting a domain, the intake page immediately shows an animated progress card with step checklist and page counts, polling `/api/audits/[auditRunId]/status` every 2.5 seconds.

### Report badge (since v0.2)
- `rendered_browser + complete` → "Rendered audit" · `rendered_browser + partial_complete` → "Mixed capture audit" · `static_public` → "Static fallback audit" · `secondary_static` → "Partial/static audit"

## Local setup

```sh
cp .env.example .env.local   # fill in real values
npm install                  # installs dependencies including @sparticuz/chromium
npm run migrate:up:local     # apply all current Postgres migrations
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
| `npm run migrate:up:vercel:prod` | Pull Vercel production env into an ignored local file, then apply migrations to that `DATABASE_URL` |
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
worker/         Legacy/internal Playwright package retained for dependency/runtime packaging notes
migrations/     Reversible SQL migrations (up + down)
tests/          Unit and integration tests
public/         Static assets
```

## Architecture decisions

- **App runtime** (Next.js / Vercel): intake, audit processing trigger, browser capture orchestration, report viewing.
- **Processing path**: `submitDomainAction()` creates the audit run and enqueues `audit.run`; `/api/worker/process` drains jobs from the request path or the GitHub Actions worker drain.
- **Browser runtime**: `src/server/browser/*` owns the `BrowserDriver` / `BrowserSession` seam. The default adapter remains Playwright + `@sparticuz/chromium`; the optional `browser_use` path is an external HTTP sidecar boundary only. Audit orchestration, scoring, reporting, and enrichment stay in this repo.
- **Queue**: `pg-boss` behind `src/server/contracts/queue.ts`.
- **Storage**: local FS provider remains the dev default. Vercel Blob support exists behind `src/server/contracts/storage.ts`; production private artifact access still needs validation.
- **DB client / ORM**: raw `pg` client with raw SQL migrations in `migrations/`.
- **Evidence labels**: every finding is `Measured | Observed | Inferred`. Never present Inferred as Measured.
- **Capture fidelity**: reports and agent context expose `rendered_browser`, `static_public`, `secondary_static`, `manual_evidence`, or `blocked_no_evidence`.
- **Prospect Audit Agent**: `src/server/agents/prospect-audit-agent.*` uses strict Zod validation and only accepted findings/evidence, scores, capture fidelity, limitation notes, and coverage metadata.
- **AI workflow manifests**: `workflow.yaml` describes the deterministic audit workflow plus bounded LLM synthesis layer. `agents.yaml` describes the Prospect Audit Agent permissions, inputs, outputs, and forbidden behavior.
- **Prompt governance**: `docs/agentic/architecture.md` documents the truth boundary. `docs/agentic/prompts.md` inventories prompt/schema/runner artifacts.

## Not yet implemented

- [x] Playwright capture path
- [x] In-project processing (discovery, capture, analysis)
- [x] Deterministic evidence extraction + finding generation
- [x] Scoring + report views (`/report/[auditRunId]`, `/report/[auditRunId]/full`)
- [ ] Production private artifact storage validation
- [x] LLM enrichment layer
- [x] Persisted Prospect Intelligence
- [x] Auth / access control

## Access control

The repository is public, but the deployed Vercel app is not. All product routes are protected by an app-level access gate — no live demo is exposed.

### How it works

- Next.js middleware (`src/middleware.ts`) guards every request to protected routes.
- Valid access is a 30-day HMAC-SHA256-signed cookie (`ia_session`), issued after the correct password is entered at `/internal-login`.
- Signing uses the Web Crypto API — no external auth library required.
- `/api/worker/process` is **exempt** from the cookie gate; its own `WORKER_SECRET` header check is the auth layer (used by GitHub Actions).
- The homepage `/` is public and shows a "private internal tool" landing page with a sign-in link.
- `/internal-logout` clears the cookie and redirects to `/`.

### Protected routes

| Route | Guard |
|---|---|
| `/intake` | Session cookie |
| `/audits` | Session cookie |
| `/report/:path*` | Session cookie |
| `/api/audits/:path*` | Session cookie |
| `/api/reports/:path*` | Session cookie |
| `/api/worker/:path*` | Session cookie |
| `/api/worker/process` | `WORKER_SECRET` header only (exempt from cookie) |

### Public routes

`/`, `/internal-login`, `/internal-logout`, `/_next/*`, `/favicon.ico`, `/robots.txt`, `/sitemap.xml`

### Required env vars (production)

| Variable | Description |
|---|---|
| `INTERNAL_ACCESS_PASSWORD` | Password shown on `/internal-login`. Min 8 chars. |
| `INTERNAL_ACCESS_COOKIE_SECRET` | HMAC signing secret for the session cookie. Min 32 chars. Generate with `openssl rand -base64 32`. |

Both are optional in local dev — the gate opens automatically when the secret is not configured (so `npm run dev` works without setup).

### Repo vs. deployed app

The GitHub repository is public (code, architecture, manifests). The deployed Vercel app is private — no audit runs, reports, intake, or enrichment are accessible without the internal access password. Code being public does not expose the tool.

## Shot 3 status

- Capture logic now runs through app-side server modules under `src/server/audits/`.
- Intake schedules processing from inside the Vercel project; no external worker host is required.
- Discover up to 5 priority pages (homepage, about, services, contact, content).
- Stores page screenshots and HTML natively to `.storage/` artifact dir.
- Persists `page_snapshots` and orchestrates status (`discovering` → `capturing` → `analyzing` → `complete`).

## Deploy smoke test (pending)

Current state is Vercel-only in code: the app creates `audit.run` jobs in `pg-boss` and schedules processing
from the same request lifecycle with `after(...)`. There is no external worker URL, shared secret, or second host.
This checklist is still pending, not a report of current success. The deployed intake flow is currently failing at runtime, so the end-to-end Vercel smoke pass remains unresolved.

App runtime envs:
- Required: `DATABASE_URL` (canonical DB connection string used by both app runtime and migrations)
- Required in production: `WORKER_SECRET` for worker routes and `AUDIT_API_KEY` for report enrichment/PDF/prospect routes
- Required when `STORAGE_PROVIDER=vercel_blob` in production: `BLOB_READ_WRITE_TOKEN`
- Optional: `PG_BOSS_SCHEMA` (defaults to `pgboss`), `BROWSER_DRIVER` (defaults to `playwright`), `BROWSER_USE_BASE_URL`, `BROWSER_USE_API_TOKEN`, `GEMINI_API_KEY`, `GEMINI_MODEL` (defaults to `gemini-2.5-flash`), `NEXT_PUBLIC_APP_URL`, `STORAGE_PROVIDER`

No Vercel Cron is configured because Hobby deployments reject sub-daily cron schedules. `.github/workflows/worker-drain.yml` can drain `/api/worker/process` every 5 minutes using GitHub repository secrets `WORKER_DRAIN_URL` (for example, `https://your-app.vercel.app/api/worker/process`) and `WORKER_SECRET`. `/api/worker/trigger` is retained as a protected compatibility route only.
Browser capture defaults to `@sparticuz/chromium` (Lambda-compatible binary) + `playwright-core`. No `postinstall` step or browser download is required; `npm install` is sufficient for both local dev and Vercel. The optional `browser_use` path is not in-process product logic; it expects a separately run sidecar/service that exposes the repo-owned browser session contract over HTTP. The `worker/` directory is legacy and is **not** a workspace — it is excluded from the root install to prevent the full `playwright` package from being installed and polluting `playwright-core/.local-browsers/`.

1. Ensure the Next.js app deployment has `DATABASE_URL` set.
2. Ensure DB migrations are applied against the production database. Vercel deploys run `npm run build` / `next build`; they do not run production migrations automatically.

   ```sh
   DATABASE_URL=postgres://... npm run migrate:up
   ```

   To use the same `DATABASE_URL` configured on the Vercel project:

   ```sh
   npm run migrate:up:vercel:prod
   ```

   This applies every numbered SQL migration in `migrations/` in order (currently `0001` through `0008`). `POSTGRES_URL`, `DATABASE_URL_UNPOOLED`, and other provider helper variables are ignored unless their value is copied into `DATABASE_URL`.

3. Once the runtime issue is resolved, submit a real domain on `/intake` in the Vercel app and capture the returned `auditRunId`.
4. Expected success signals after the runtime issue is fixed:
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
- Prospect Audit Agent output is stored in `prospect_intelligence` with model, prompt version, schema version, input hash, capture fidelity, scores, primary gap, recommended service, and outreach angle.
- Deterministic report remains source of truth. LLM enrichment is additive and opt-in.
- `GEMINI_API_KEY` is optional. Missing key returns 503 from the enrich route and hides the enrichment section from the report page — base report is unaffected.
- `GEMINI_MODEL` is optional and defaults to `gemini-2.5-flash`.
- Operational smoke testing is still pending; the MVP is not operationally validated yet.

## Shot 7 status — runtime fixes + dashboard

- `launchBrowser()` now always sets `PLAYWRIGHT_BROWSERS_PATH=0` and passes `--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage` — required for Lambda environments where Chrome runs as root and `/dev/shm` is constrained.
- `export const maxDuration = 300` added to the intake route segment so Vercel allows the `after()` Playwright callback up to 5 minutes (Pro plan limit).
- `/audits` dashboard page added — reads recent audit runs from DB, shows status badges, failure reasons, and report links. Works with zero enrichment.
- All existing tests still pass; 4 new tests added for the `AuditRunListItem` shape.

## Shot 12 — report professionalization pass

- Finding copy and recommendations were tightened so stored audit output reads more like a consultant review and less like a generic heuristic engine.
- New document-style report route at `/report/[auditRunId]/full` adds: executive summary, top priorities, score summary, category-by-category review, strategic readout, recommended next actions, and appendix/evidence notes.
- Full report assembly is deterministic and grounded in existing findings/scores only. No new issues are invented in the long-form view.
- Report UI now strips repetitive homepage-only prefixes from rendered finding copy while preserving the scope notice at the report level.
- Added focused tests for full-report data shaping and route rendering.

## Shot 13 — browser runtime abstraction spike

- Capture runtime now goes through `src/server/browser/*`, not directly through `playwright-core` types in `capture-audit-run.ts`.
- `PlaywrightChromiumDriver` preserves the Vercel-safe default path, including `@sparticuz/chromium`, `playwright-core`, launch flags, and `PLAYWRIGHT_BROWSERS_PATH=0`.
- `BrowserUseDriver` is an optional HTTP adapter seam only. It assumes a remote service or sidecar that exposes repo-owned session endpoints; browser-use agent planning stays outside this app.
- `BROWSER_DRIVER=playwright|browser_use` now selects the adapter. Default remains `playwright`.

## Validation note

- Vercel-only processing is the deployed architecture in code.
- Lambda browser flags and intake `maxDuration` are now set correctly.
- Operational smoke validation on a real Vercel deployment is still required to confirm end-to-end success.
- Remaining production risks: local FS storage is dev-only and needs a real provider for production artifacts.

## Current known limitations

- Operational smoke validation on Vercel is still pending.
- Static-only and secondary-static reports intentionally exclude visual/mobile/above-the-fold scoring and claims.
- Prospect Intelligence is internal prospecting guidance, not audit truth.
- Artifact privacy must be validated before relying on Vercel Blob in production.

See `plan.md` for the milestone roadmap.
