# Worker

This directory is a legacy/deprecated deployment target and is no longer required as separate production infrastructure.

## Current role

- The deployed architecture is now Vercel-only.
- Browser capture is triggered from the app project and runs through `src/server/audits/*`.
- `worker/package.json` remains in-repo because it still owns the Playwright dependency that the root workspace install needs.

## What is archived here

- Legacy external-worker HTTP server code (`worker/src/index.ts`)
- Legacy worker-focused tests and package scripts
- Older notes from the separate-host model

Do not treat this folder as required production infrastructure.

## Truthful status

- No `WORKER_ENDPOINT`
- No `WORKER_SECRET`
- No separate worker host required for the intended deployment model
- Real Vercel smoke validation for Playwright execution is still pending
