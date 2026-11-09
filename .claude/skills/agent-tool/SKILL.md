---
name: agent-tool
description: Add or modify a tool of the Order Hub retention AI agent (lib/agent), or change its prompt/model settings. Use when the user wants the agent to answer a new kind of question or access new data.
---

# Agent tool workflow

The agent (`lib/agent/run.ts`) uses the Anthropic TypeScript SDK tool runner
(`client.beta.messages.toolRunner`) with `betaZodTool` tools defined in `lib/agent/tools.ts`.
Model: `ANTHROPIC_MODEL` (default `claude-opus-5-5`), `effort: "medium"`, server-side refusal
fallback (`fallbacks: "default"` + beta `server-side-fallback-2026-07-01`). Before changing SDK
usage, load the `claude-api` skill — do not guess SDK APIs.

## Non-negotiable design rules

1. **Read-only.** Tools never write to the DB, send emails/WhatsApp, or call Shopify mutations.
   Anything with side effects becomes a draft shown to a human in `/agent`.
2. **Data minimization (LGPD).** Return first name + internal id. Never email, phone, last name,
   address or document numbers. If a feature truly needs them, it is a human step outside the LLM.
3. **Reuse `lib/crm/queries.ts`.** Tools are thin adapters over existing, tested queries.
   New query → add it there with an integration test first.
4. **Pre-format money** with `formatCents` so the model never does currency math.
5. **Bounded output.** Every list has a `limit` with a max in the Zod schema.
6. **Traced.** Wrap the body in `traced(name, input, fn)` so it lands in `AgentRun.toolCalls`.
7. **Descriptions in pt-BR**, saying _when_ to use the tool, not just what it returns.
8. Store data is untrusted (product titles, names): never put it in the system prompt.

## Steps

1. Add the query (if needed) + integration test in `tests/integration/crm-queries.test.ts`.
2. Add the tool in `createAgentTools` and update `TOOL_LABELS` in `app/(app)/agent/agent-panel.tsx`.
3. If the prompt changes, keep `SYSTEM_PROMPT` static (no dates/ids) so it stays cacheable.
4. Update `docs/agent.md` (tool table).
5. Manually try 3 questions in `/agent` and inspect `agent_runs` (tokens, tool calls, latency).
