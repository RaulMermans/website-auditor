# Scratchpad

Use this file for working notes, open questions, and decisions in flight.
Archive or delete entries once resolved.

---

## Open decisions

### Storage provider
- Options: Vercel Blob, AWS S3, Cloudflare R2
- Constraint: artifacts must be access-controlled (no raw public URLs)
- Decision needed before Shot 3

---

## Notes

- Shot 2 decisions resolved: raw `pg` for Postgres access, `pg-boss` for queue dispatch.
- Intake persists `target_domains` and `audit_runs` before enqueue; enqueue failure marks the run `failed`.
- Shot 2.5 adds a disposable-DB integration proof: real migration + real persistence + real `pg-boss` enqueue via `TEST_DATABASE_URL`.
- Worker boundary is structural: no Playwright in app runtime under any circumstances.
- Evidence label discipline: every Finding must set label at creation time, not retroactively.
- Homepage-only fallback must be explicit in the UI — never hide reduced-scope audits.
