# Worker

This directory contains the **separate Node.js Playwright worker** for all browser-heavy execution.

The worker is deliberately isolated from the Next.js app runtime. No Playwright code runs inside the app.

## Boundary contract

The app dispatches work via `src/server/contracts/worker.ts`. The worker:
1. Receives a `WorkerCaptureRequest` (auditRunId, domain, maxPages)
2. Runs Playwright: discovery, screenshots, DOM extraction, traces
3. Persists artifacts to blob storage
4. Persists page snapshots and evidence to Postgres
5. Returns a `WorkerCaptureResult`

Authentication: HMAC-signed request from app → worker using `WORKER_SECRET`.

## Status

**Shot 3 Implemented.** The worker can discover up to 5 priority pages, capture HTML/screenshots using Playwright, and persist artifacts and DB rows (`page_snapshots`).

## Planned layout

```
worker/
  src/
    index.ts          # HTTP server entry
    capture.ts        # orchestrates Playwright per domain
    discovery.ts      # finds priority pages
    screenshot.ts     # captures screenshots
    dom-extract.ts    # DOM evidence extraction
  playwright.config.ts
  tsconfig.json
  package.json        # separate deps; playwright here not in root
```

## Running

Requires `DATABASE_URL` to be present in the environment (e.g., inherited from root `.env.local`).

```sh
cd worker
npm install
npm run dev -- --audit-run-id=<uuid> --domain=https://example.com
```
