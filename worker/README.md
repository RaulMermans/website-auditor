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

Operationally, the worker is currently an HTTP service only. There is not yet an always-on `pg-boss`
consumer in this package. For the first production smoke test, the root repo provides
`npm run smoke:dispatch-once` to fetch one queued `audit.run` job and call this worker.

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

Requires `DATABASE_URL` and `WORKER_SECRET` to be present in the environment (e.g., inherited from root `.env.local` or explicitly passed).

```sh
cd worker
npm install
WORKER_SECRET=dev_secret PORT=3001 npm run dev
```

Then dispatch requests via the main Next.js app or explicitly via cURL with the correct `x-worker-signature` header.

## Production-style start

The worker is deployed separately from the Vercel app and must run as its own Node process.

```sh
cd worker
npm install
npm run build
PORT=3001 npm run start
```

Required env vars:
- `DATABASE_URL`
- `WORKER_SECRET`

Optional:
- `PORT` (defaults to `3001`)
