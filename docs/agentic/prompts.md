# Prompt Inventory

## Prospect Audit Agent

Prompt file:
`src/server/agents/prospect-audit-agent.prompt.ts`

Schema file:
`src/server/agents/prospect-audit-agent.schema.ts`

Runner:
`src/server/agents/prospect-audit-agent.ts`

Purpose:
Turns accepted deterministic audit evidence into internal prospecting intelligence.

Input boundary:
Accepted findings only.

Forbidden:
- rejected findings
- invented metrics
- invented revenue/traffic
- visual claims without browser evidence
- anti-bot bypass suggestions

Output:
Strict structured JSON validated by Zod.
