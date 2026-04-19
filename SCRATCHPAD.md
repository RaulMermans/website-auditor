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
- Worker boundary is structural: no Playwright in app runtime under any circumstances.
- Evidence label discipline: every Finding must set label at creation time, not retroactively.
- Shot 3 adds the worker runtime, Playwright discovery, capture, and page_snapshots. The worker uses `tsx` as an isolated CLI script right now.
- Operational smoke testing remains pending, so the MVP is not operationally validated yet.
- Shot 4 can proceed against stored snapshot artifacts despite that, but runtime validation is still a later gate.

---

## Ops smoke test findings (2026-04-18)

**Deploy-readiness: deploy-ready-with-fixes**

### Current assessment
1. `scripts/smoke-dispatch-once.mjs` matches the current runtime contract:
   it fetches one `audit.run` job from `pg-boss`, signs the raw JSON payload with HMAC, and posts it to `POST /capture`.
2. App deploy path is Vercel-ready with defaults:
   `DATABASE_URL` is required, `PG_BOSS_SCHEMA` and `NEXT_PUBLIC_APP_URL` are optional.
3. Worker deploy path is manual but valid:
   run a separate Node host with `DATABASE_URL` and `WORKER_SECRET`; current storage is local `.storage/`.
4. `migrate:up` is repeatable against the same database with the current SQL files.
5. `test:integration` still requires an explicit disposable `TEST_DATABASE_URL`; it was not runnable in this audit shell without that env.

### Known gaps before production smoke test
1. **Worker deployment is not automated in-repo**: there is no Dockerfile or provider config.
2. **Storage is local FS only**: acceptable for a one-run smoke test, not for long-term multi-operator use.
3. **No always-on queue consumer**: `smoke:dispatch-once` remains a manual bridge by design.

### App layer env required at Vercel runtime
- `DATABASE_URL` — required; without it, intake action throws on first request
- `PG_BOSS_SCHEMA` — optional; defaults to `pgboss`
- `NEXT_PUBLIC_APP_URL` — optional; used for links only
- `WORKER_SECRET` and `WORKER_ENDPOINT` are NOT needed by the Vercel app; only by `smoke:dispatch-once`

### Worker env required at worker process startup
- `DATABASE_URL` — required; worker rejects requests without it
- `WORKER_SECRET` — required; HMAC validation fails without it
- `PORT` — optional; defaults to 3001
