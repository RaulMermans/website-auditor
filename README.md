# Website Audit Agent

![CI](https://github.com/RaulMermans/website-auditor/actions/workflows/ci.yml/badge.svg)
![Status](https://img.shields.io/badge/status-internal%20MVP-555)
![TypeScript](https://img.shields.io/badge/TypeScript-99.4%25-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-black)

Evidence-bounded website audit workflow for internal prospecting.

`website-auditor` accepts a public website URL, captures authorized public evidence, produces deterministic audit findings and category scores, then optionally uses a bounded Gemini synthesis layer to translate accepted evidence into internal prospect intelligence.

The core architectural rule is simple:

> The deterministic audit engine creates audit truth.  
> The LLM may synthesize accepted evidence, but it cannot invent findings, scores, metrics, traffic claims, revenue claims, or audit facts.

This repository is public for portfolio and reference purposes. The deployed Vercel app is private and no public demo is currently exposed.

---

## Why this exists

Most AI audit tools blur three things that should stay separate:

1. **Measured evidence** — what the system actually captured.
2. **Deterministic findings** — what rules can safely conclude from that evidence.
3. **Strategic synthesis** — how those findings may translate into business-development opportunities.

This project separates those layers.

It is not a chatbot that “looks at a website and gives opinions.”  
It is a bounded audit workflow with evidence capture, deterministic scoring, storage, worker execution, access control, and a constrained LLM synthesis layer.

---

## What it does

- Accepts a public website URL through an internal intake flow.
- Creates an `audit_run` record in Postgres.
- Enqueues an `audit.run` job through `pg-boss`.
- Runs an event-driven worker route inside the Vercel app.
- Captures homepage evidence with a browser-first strategy.
- Falls back to authorized public static evidence when rendering is blocked or unavailable.
- Stores page snapshots and page evidence.
- Produces deterministic findings and category scores.
- Labels claims as `Measured`, `Observed`, or `Inferred`.
- Generates report-ready audit narratives.
- Optionally creates internal prospect intelligence through a bounded Gemini agent.
- Protects the deployed app behind internal access controls.

---

## What it is not

This project is intentionally scoped.

It is **not**:

- a public SaaS product
- a generic website crawler
- an anti-bot bypass system
- a Lighthouse replacement
- a full SEO or accessibility scanner
- a fully autonomous AI auditor
- a system where the LLM decides audit truth
- a tool for scanning private, authenticated, or restricted pages

The system only works with authorized public website evidence.

---

## System architecture

```mermaid
flowchart TD
  A["Internal user enters domain"] --> B["submitDomainAction()"]
  B --> C["Create audit_run in Postgres"]
  C --> D["Enqueue audit.run job via pg-boss"]
  D --> E["Trigger /api/worker/process"]
  E --> F["Capture pipeline"]

  F --> G["Browser-first homepage capture"]
  F --> H["Static public fallback"]

  G --> I["page_snapshots + page_evidence"]
  H --> I

  I --> J["Deterministic audit engine"]
  J --> K["Findings + category scores"]

  K --> L["Report assembly"]
  K --> M["Optional Prospect Audit Agent"]

  M --> N["prospect_intelligence"]
  L --> O["Internal audit report"]
  N --> O
