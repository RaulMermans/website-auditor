# Agentic Architecture

This project is a hybrid AI workflow, not a fully autonomous agent system.

## Architecture

Deterministic workflow:
- intake
- browser/static capture
- evidence extraction
- evaluators
- review gate
- scoring
- report generation

LLM layer:
- Prospect Audit Agent

## Truth Boundary

The deterministic audit engine creates audit truth.
The LLM may synthesize accepted evidence but must not create, accept, reject, or score findings.

## Capture Policy

Browser-first capture is attempted where allowed.
If browser capture is blocked, the system falls back to static or secondary-static evidence.
The system does not bypass anti-bot protection.

## Evidence Policy

Rejected findings are excluded.
Uninspected categories are unknown, not clean.
Static fallback findings use bounded language.

## Agent Inventory

See:
- agents.yaml
- workflow.yaml
