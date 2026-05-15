# Project Overview

This is an **internal Prospect Audit Tool** for Raul — not a public SaaS. It accepts a prospect URL and produces a credible, evidence-backed website audit plus persisted client-acquisition intelligence. The audit engine is deterministic. LLMs may synthesize accepted evidence but must not create audit truth. Architecture: Next.js app on Vercel, Postgres, async queue, artifact storage abstractions, browser-first capture, deterministic scoring, and Gemini-powered Prospect Audit Agent synthesis.

Resolved setup:
- Target: fullstack
- Stack: Node.js + TypeScript
- Repo state: greenfield
- Data: Postgres
- Deploy: managed-cloud
- License: MIT
- Sensitivity: none
- Repo type: single-repo
- Coverage target: 80% lines

Current phase: Browser-first capture, partial-complete policy, capture-fidelity-aware finding language, animated audit progress UX, and decision-grade report UX are implemented. Operational smoke validation is still pending, and deployed intake/worker durability must be proven on Vercel.

# Goals

- Ship an MVP that can audit at least one real public site end-to-end with evidence-backed findings.
- Keep the pipeline rule-first and LLM-second so conclusions are grounded in stored evidence.
- Produce commercially usable outputs: report, quick wins, strategic improvements, and outreach draft.
- Keep heavy browser execution off the interactive intake/reporting path.
- Preserve repeatability through structured entities, stored artifacts, and deterministic scoring inputs.
- Persist Prospect Intelligence for internal prospecting and outreach positioning.

# Non-goals

- Full recursive crawl of every page in v1.
- Login-required journey auditing in v1.
- Autonomous outbound sending in v1.
- Autonomous audit judging or LLM-controlled crawling/scoring/finding acceptance.
- Per-industry custom intelligence before core reliability is proven.
- “Perfect website judge” behavior or speculative revenue theater.

# Domain Constraints

- Every finding must be labeled as Measured, Observed, or Inferred.
- Never present inferred claims as measured facts.
- UX/UI claims require browser evidence.
- Static-only audits must exclude visual hierarchy, mobile layout, above-the-fold composition, rendered interaction states, and screenshot-based UX scoring.
- Homepage-only audits must be explicitly labeled as homepage-only.
- MVP audits cover up to 5 priority pages: homepage, about, services/product, contact/booking, and one representative content page.
- If discovery fails, fall back to homepage-only mode instead of blocking completion.
- Heavy browser work, screenshots, DOM extraction, and traces must run through the server-side audit processing path, not client/UI flows.
- No revenue-loss claims unless tied to a transparent estimation rule.
- Never suggest bypassing anti-bot protection; detect, classify, downgrade capture fidelity, and continue only with authorized public evidence.
- Browser capture validates the final URL after navigation — before any HTML extraction, screenshot, or artifact storage. Off-origin redirects and private/internal redirect targets are rejected as capture failures.

# Codebase Map

Repo shape: single-repo fullstack app with in-project audit-processing modules and a retained legacy worker package.

Expected layout:
- `src/app/` — Next.js App Router pages, layouts, route handlers, report views
- `src/components/` — UI components for intake, dashboard, report detail, artifacts
- `src/lib/` — shared utilities, validation, scoring helpers, queue client, storage helpers
- `src/server/` — server-side orchestration, job creation, report assembly
- `src/server/agents/` — Prospect Audit Agent prompt, schema, and Gemini orchestration
- `src/db/` — database access, entity mappers, persistence helpers
- `worker/` — legacy/internal Playwright package and archived separate-host notes; not a required production deployment target
- `migrations/` — reversible SQL migrations for Postgres schema changes
- `tests/` — unit, integration, and regression fixtures
- `public/` — static assets for report/export UI

Key configs:
- `package.json` — dependency and script entrypoint
- `tsconfig.json` — TypeScript settings for the app and retained worker package
- `next.config.*` — Next.js runtime and build configuration
- `.env.example` — documented environment variable contract with no secrets
- `.gitignore` — exclude local env files and generated artifacts
- `README.md` — local setup, architecture summary, and operator workflow
- `workflow.yaml` — canonical machine-readable deterministic workflow + bounded LLM synthesis manifest
- `agents.yaml` — canonical machine-readable Prospect Audit Agent manifest
- `docs/agentic/` — prompt inventory and agentic architecture/truth-boundary docs
- `vercel.json` — deployment and routing config when needed
- `playwright.config.*` — shared browser automation defaults when applicable

Core domain entities:
- `project`
- `target_domain`
- `audit_run`
- `page_snapshot`
- `page_evidence`
- `finding`
- `recommendation`
- `outreach_asset`
- `rubric`
- `scorecard`
- `prospect_intelligence`

# Run/Test/Build

```sh
npm install
npm run dev
npm test
npm run build

# DB conventions
# - keep schema changes in migrations/
# - make every migration reversible
# - persist audit metadata in Postgres
# - store screenshots/html snapshots/artifacts in blob storage
# - process audit jobs asynchronously via a queue
# - keep LLM synthesis downstream of accepted deterministic evidence
```

# Collaboration & Change Workflow

Work in small vertical slices aligned to the current milestone and acceptance criteria. Prefer one contained change set over broad parallel refactors. Use Conventional Commits.

Standard loop:
1. Plan the slice and list touched files.
2. Make the smallest viable diff.
3. Run tests for impacted paths.
4. Check operator impact, audit-processing impact, and artifact persistence impact.
5. Merge only when evidence handling, labels, and fallback behavior are preserved.

Before acting:
- Read the current milestone, task ID, acceptance criteria, and non-goals.
- Confirm which files are allowed to change.
- State intended commands before running anything non-trivial.

Preferred commit shapes:
- `feat: add domain intake and audit job creation`
- `feat: persist page evidence and finding labels`
- `fix: handle homepage-only fallback labeling`
- `test: add regression fixture for discovery failure`

# Security & Privacy

- Never commit or print secrets.
- Use `.env` locally and keep `.env.example` updated with `${VAR}` names only.
- Treat screenshots, HTML snapshots, console logs, and captured page content as sensitive artifacts even when sourced from public sites.
- Redact incidental personal data from logs, prompts, fixtures, and exported examples.
- Do not let the LLM invent facts not present in stored evidence.
- The audit engine is deterministic. LLMs may synthesize accepted evidence but must not create audit truth.
- Only generate commercial outputs from approved findings.
- Keep audit artifacts access-controlled and avoid exposing raw storage URLs in the UI.
- Log success/failure reasons for every run without leaking credentials, tokens, or private config.

# Assumptions

- Greenfield single-repo implementation.
- Fullstack Node.js + TypeScript stack with Next.js App Router.
- Managed-cloud deployment on Vercel for the app/orchestration layer.
- Vercel-only app deployment is the intended production model; no external worker host is required.
- Postgres is the system of record.
- Artifact storage currently uses a local filesystem provider in code; private Vercel Blob support exists behind the storage abstraction but production artifact access control still needs validation.
- Queue abstraction is available and Vercel-compatible.
- Gemini is the active enrichment provider for report enrichment and Prospect Audit Agent synthesis.
- Worker processing is available at `/api/worker/process` — the canonical and only worker execution route. GitHub Actions can drain the queue by POSTing to this route with `WORKER_SECRET`. Required production env vars: `WORKER_SECRET`, `AUDIT_API_KEY`, `GEMINI_API_KEY`, `DATABASE_URL`, `INTERNAL_ACCESS_PASSWORD`, `INTERNAL_ACCESS_COOKIE_SECRET`.
- `/api/worker/trigger` has been removed. Do not reference or recreate it.
- Prospect Intelligence is structured around a reach-out decision (yes/maybe/no), service recommendation, per-opportunity evidence labels, and outreach angle. Old flat records are normalized on read via `normalizeProspectIntelligenceResult`.
- Operational smoke validation is still pending, and the production intake flow is currently failing at runtime.
- The repository may be public. The deployed Vercel app is protected by an app-level access gate: HMAC-SHA256-signed HttpOnly cookie (`ia_session`) issued at `/internal-login`. All product and API routes require the cookie. `/api/worker/process` is exempt and uses `WORKER_SECRET` only. The gate is open in dev/test when `INTERNAL_ACCESS_COOKIE_SECRET` is not set. Required production env vars: `INTERNAL_ACCESS_PASSWORD` (≥8 chars) and `INTERNAL_ACCESS_COOKIE_SECRET` (≥32 chars). No live demo is exposed; code being public does not expose the tool.
- Sensitivity is set to none, but captured artifacts are still handled conservatively.
- Default test target is 80% line coverage.
- Commands assume broad greenfield scripts: `npm run dev`, `npm test`, `npm run build`.
- Secondary page review-gate failures produce `partial_complete` (not `needs_human_review`) when at least one high-priority page (homepage, contact, services, pricing) was accepted. Only high-priority-page review conflicts, all-legal-accepted, or majority-failed scenarios escalate to `needs_human_review`.
- Rejected page findings are excluded from scores and report output. Evidence Notes lists excluded/needs_review pages with their URLs, page types, and escalation reasons.
- Static fallback findings (missing title, H1, canonical, meta description) use bounded language — "not detected in captured static HTML" — rather than definitive "missing" language for static/fallback_static/secondary_static captures.
- Static fallback claim bounding is applied at report time so old persisted findings render safely. Secondary-static reports use "captured secondary static HTML."
- Homepage-failed secondary-static audits lower confidence and must not render brand, conversion, trust, experience flow, or mobile experience as healthy when homepage/browser/screenshot evidence is absent.
- Blocked-target failures are expected handled terminal states. The user-facing state is "Automated capture was blocked," and the worker route should not present handled capture-denied conditions as crashed runtime failures.
- `workflow.yaml` and `agents.yaml` are the canonical architecture manifests. Prompt governance docs live in `docs/agentic/`.
- Audit progress UI shows animated step updates after submission, polling `/api/audits/[auditRunId]/status` every 2.5 seconds until a terminal status is reached.
- The system does not bypass anti-bot protections; it detects, classifies, downgrades capture fidelity, and continues with public evidence.
- Report badges are capture-fidelity-aware: `rendered_browser + complete → "Rendered audit"`, `rendered_browser + partial_complete → "Mixed capture audit"`, `static_public → "Static fallback audit"`, `secondary_static → "Partial/static audit"`.
