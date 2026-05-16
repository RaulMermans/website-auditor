# Security Policy

## Scope

This is an internal tool. The repository is public (code, architecture, manifests). The live Vercel deployment is private — all product and API routes require the internal access cookie. No public demo is exposed.

## Reporting a Vulnerability

If you discover a security issue in the code, please report it via GitHub's private vulnerability reporting feature on this repository. Do not open a public issue.

Include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact

## Access Control

The deployed app is protected by an app-level HMAC-SHA256 signed cookie gate. No routes that trigger compute (audits, enrichment, worker) are accessible without credentials. The worker endpoint (`/api/worker/process`) is additionally protected by a `WORKER_SECRET` header.

## Secrets

No credentials, API keys, or real connection strings are committed in this repository. `.env.example` contains only placeholder values. Real secrets are injected as Vercel environment variables at deploy time.
