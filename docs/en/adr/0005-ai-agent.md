# 0005 — Read-only AI agent with human review

🌐 **English** · [Português](../../pt-BR/adr/0005-ai-agent.md) · [Italiano](../../it/adr/0005-ai-agent.md)

- **Status:** accepted
- **Date:** 2026-11-09

## Context

The team wants to ask about the customer base in natural language and get draft retention
messages. Risks: hallucination, personal data leaks (LGPD), prompt injection through store data,
and cost.

## Decision

- Tool calling with the Anthropic SDK tool runner and **read-only** Zod tools over the same
  tested queries as the dashboard.
- Minimization: the model receives first name and internal id, never contact details.
- Output is always an editable draft; nothing is sent automatically.
- Per-user quota, bounded iterations, audit log in `agent_runs`.
- Server-side refusal fallback and explicit handling of `refusal`.

## Consequences

- (+) Even a successful prompt injection has no dangerous tool to use.
- (+) Cost and behavior observable per run.
- (−) To send the campaign, a human copies the draft — intentional at this stage.
- (−) No automated evals yet: see [limitations.md](../limitations.md), items G1–G5.
