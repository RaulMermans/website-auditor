# Scratchpad

Use this file for working notes, open questions, and decisions in flight.
Archive or delete entries once resolved.

---

## Open decisions

### Queue provider
- Options: Inngest, Trigger.dev, pg-boss (self-hosted), Vercel Queue (if GA)
- Constraint: must work on Vercel managed-cloud
- Decision needed before Shot 2

### Storage provider
- Options: Vercel Blob, AWS S3, Cloudflare R2
- Constraint: artifacts must be access-controlled (no raw public URLs)
- Decision needed before Shot 3

### DB client / ORM
- Options: raw pg, Drizzle ORM, Kysely, Prisma
- Constraint: migrations must be reversible; avoid lock-in that complicates Vercel edge
- Decision needed before Shot 2

---

## Notes

- Worker boundary is structural: no Playwright in app runtime under any circumstances.
- Evidence label discipline: every Finding must set label at creation time, not retroactively.
- Homepage-only fallback must be explicit in the UI — never hide reduced-scope audits.
