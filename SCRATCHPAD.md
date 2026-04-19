# Scratchpad

Use this file for working notes, open questions, and decisions in flight.
Archive or delete entries once resolved.

---

## Open decisions

### Storage provider
- Options: Vercel Blob, AWS S3, Cloudflare R2
- Constraint: artifacts must be access-controlled (no raw public URLs)
- Currently resolved for Shot 3: using local `.storage` filesystem provider to unblock development while maintaining the abstract interface. Real provider required later.

---

## Notes

- Shot 2 decisions resolved: raw `pg` for Postgres access, `pg-boss` for queue dispatch.
- Intake persists `target_domains` and `audit_runs` before enqueue; enqueue failure marks the run `failed`.
- Shot 2.5 adds a disposable-DB integration proof: real migration + real persistence + real `pg-boss` enqueue via `TEST_DATABASE_URL`.
- Vercel-only pivot: intake now schedules audit processing from inside the app project with `after(...)`.
- External worker envs (`WORKER_ENDPOINT`, `WORKER_SECRET`) are removed from the app contract.
- Evidence label discipline: every Finding must set label at creation time, not retroactively.
- Playwright capture, snapshot persistence, and deterministic analysis now run through app-side server modules.
- Operational smoke testing remains pending, so the MVP is not operationally validated yet.
- Shot 4 can proceed against stored snapshot artifacts despite that, but runtime validation is still a later gate.
- Shot 5 adds scoring and report view. Scores are computed from DB findings at render time; no storage reads. Operational smoke testing remains pending — the MVP is still not operationally validated.
- Shot 6 adds LLM enrichment and outreach assets on top of deterministic report data. Enrichment is opt-in (POST /api/reports/[id]/enrich). GEMINI_API_KEY is optional; missing key degrades gracefully. Deterministic report is always source of truth. Operational smoke testing remains pending.

---

## Vercel-only pivot status (2026-04-19)

**Implementation status: code path complete, operational smoke validation pending**

### Current assessment
1. App deploy path no longer depends on an external worker host, worker URL, or worker secret.
2. Intake now creates the audit run, enqueues `audit.run`, and schedules processing inside the same Vercel project.
3. Capture still persists `page_snapshots`, then deterministic analysis writes `page_evidence` and `findings`.
4. App deploy path is still Vercel-ready with defaults:
   `DATABASE_URL` is required, `PG_BOSS_SCHEMA` and `NEXT_PUBLIC_APP_URL` are optional.
5. `migrate:up` is repeatable against the same database with the current SQL files.
6. `test:integration` still requires an explicit disposable `TEST_DATABASE_URL`; it was not runnable in this audit shell without that env.

### Known gaps before production smoke test
1. **Playwright on deployed Vercel server execution is not yet validated**: the code path exists, but runtime compatibility still needs a real smoke run.
2. **Storage is local FS only**: acceptable for local development, not a truthful long-term production artifact strategy on Vercel.
3. **Request-scoped trigger is the current async mechanism**: there is no separate always-on consumer, so failed request-after execution still needs operational validation.

### App layer env required at Vercel runtime
- `DATABASE_URL` — required; without it, intake action throws on first request
- `PG_BOSS_SCHEMA` — optional; defaults to `pgboss`
- `NEXT_PUBLIC_APP_URL` — optional; used for links only
- `WORKER_SECRET` and `WORKER_ENDPOINT` are no longer part of the deployment contract
