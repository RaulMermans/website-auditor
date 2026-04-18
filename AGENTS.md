# Project Overview

Website Audit Agent is a fullstack Node/TypeScript system that accepts a domain and produces a credible, evidence-backed website audit for internal diagnosis, outbound personalization, and collaboration proposals. The product optimizes for trustworthiness, speed to usable audit, repeatability, clear commercial output, and minimal hallucination. Architecture: Next.js app on Vercel, Postgres, blob storage, async queue, and a separate Node.js Playwright worker for browser-heavy evidence collection.

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

# Goals

- Ship an MVP that can audit at least one real public site end-to-end with evidence-backed findings.
- Keep the pipeline rule-first and LLM-second so conclusions are grounded in stored evidence.
- Produce commercially usable outputs: report, quick wins, strategic improvements, and outreach draft.
- Decouple heavy browser execution from the web runtime.
- Preserve repeatability through structured entities, stored artifacts, and deterministic scoring inputs.

# Non-goals

- Full recursive crawl of every page in v1.
- Login-required journey auditing in v1.
- Autonomous outbound sending in v1.
- Per-industry custom intelligence before core reliability is proven.
- “Perfect website judge” behavior or speculative revenue theater.

# Domain Constraints

- Every finding must be labeled as Measured, Observed, or Inferred.
- Never present inferred claims as measured facts.
- UX/UI claims require browser evidence.
- Homepage-only audits must be explicitly labeled as homepage-only.
- MVP audits cover up to 5 priority pages: homepage, about, services/product, contact/booking, and one representative content page.
- If discovery fails, fall back to homepage-only mode instead of blocking completion.
- Heavy browser work, screenshots, DOM extraction, and traces must run outside the main app runtime.
- No revenue-loss claims unless tied to a transparent estimation rule.

# Codebase Map

Repo shape: single-repo fullstack app with an internal worker boundary.

Expected layout:
- `src/app/` — Next.js App Router pages, layouts, route handlers, report views
- `src/components/` — UI components for intake, dashboard, report detail, artifacts
- `src/lib/` — shared utilities, validation, scoring helpers, queue client, storage helpers
- `src/server/` — server-side orchestration, job creation, report assembly
- `src/db/` — database access, entity mappers, persistence helpers
- `worker/` — separate Node.js Playwright worker for discovery, capture, DOM extraction, screenshots, traces
- `migrations/` — reversible SQL migrations for Postgres schema changes
- `tests/` — unit, integration, and regression fixtures
- `public/` — static assets for report/export UI

Key configs:
- `package.json` — dependency and script entrypoint
- `tsconfig.json` — TypeScript settings for app and worker
- `next.config.*` — Next.js runtime and build configuration
- `.env.example` — documented environment variable contract with no secrets
- `.gitignore` — exclude local env files and generated artifacts
- `README.md` — local setup, architecture summary, and operator workflow
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
```

# Collaboration & Change Workflow

Work in small vertical slices aligned to the current milestone and acceptance criteria. Prefer one contained change set over broad parallel refactors. Use Conventional Commits.

Standard loop:
1. Plan the slice and list touched files.
2. Make the smallest viable diff.
3. Run tests for impacted paths.
4. Check operator impact, worker impact, and artifact persistence impact.
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
- Only generate commercial outputs from approved findings.
- Keep audit artifacts access-controlled and avoid exposing raw storage URLs in the UI.
- Log success/failure reasons for every run without leaking credentials, tokens, or private config.

# Assumptions

- Greenfield single-repo implementation.
- Fullstack Node.js + TypeScript stack with Next.js App Router.
- Managed-cloud deployment on Vercel for the app/orchestration layer.
- Separate Node.js worker process for Playwright execution.
- Postgres is the system of record.
- Blob/object storage is used for screenshots, HTML snapshots, and other artifacts.
- Queue abstraction is available and Vercel-compatible.
- Sensitivity is set to none, but captured artifacts are still handled conservatively.
- Default test target is 80% line coverage.
- Commands assume broad greenfield scripts: `npm run dev`, `npm test`, `npm run build`.

