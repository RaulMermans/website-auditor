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
