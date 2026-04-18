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

---

## Ops smoke test findings (2026-04-18)

**Deploy-readiness: deploy-ready-with-fixes**

### What was fixed
- `vitest.config.ts`: added `coverage.include`/`coverage.exclude` to scope unit coverage to `src/**` only,
  excluding DB layer and infrastructure contracts (integration-tested separately) and Next.js app layer.
  Coverage now passes at 89.2% lines (was silently failing at 10.5% due to worker/dist leaking in).
- `.env.example`: annotated which vars belong to Vercel app, worker process, smoke dispatch, and integration tests.

### Known gaps before production smoke test
1. **Worker deployment not defined**: worker must run on a VPS/Railway/Render with persistent filesystem;
   it cannot run on Vercel. No deployment config exists yet for the worker host.
2. **Storage is local FS only**: worker writes artifacts to `.storage/` relative to repo root.
   Fine for a manual smoke test with the worker running locally or on a VPS.
   A real storage provider (S3, Vercel Blob, R2) is required before multi-operator use.
3. **Migration not idempotent on repeat runs**: `migrate:up` will error if run twice against the same DB
   (the `ADD CONSTRAINT` in 0002 is not guarded). Run once on a fresh production DB only.
4. **No always-on queue consumer**: `smoke:dispatch-once` is the only bridge between the app queue and
   the worker. Shot 4+ will need a real consumer loop.

### App layer env required at Vercel runtime
- `DATABASE_URL` — required; without it, intake action throws on first request
- `PG_BOSS_SCHEMA` — optional; defaults to `pgboss`
- `NEXT_PUBLIC_APP_URL` — optional; used for links only
- `WORKER_SECRET` and `WORKER_ENDPOINT` are NOT needed by the Vercel app; only by `smoke:dispatch-once`

### Worker env required at worker process startup
- `DATABASE_URL` — required; worker rejects requests without it
- `WORKER_SECRET` — required; HMAC validation fails without it
- `PORT` — optional; defaults to 3001
