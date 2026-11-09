# Retention agent

🌐 **English** · [Português](../pt-BR/agent.md) · [Italiano](../it/agent.md)

Answers questions about the customer base and drafts retention messages (in Portuguese, for the
Brazilian team).

## How it works

```text
Question (Server Action, authenticated, Zod)
  → per-user quota over the last 24 h (agent_runs)
  → Anthropic SDK tool runner (Claude, effort "medium", max 6 iterations)
      ↔ get_store_overview / find_customers / get_customer_profile   (read-only)
  → answer shown as an editable draft
  → agent_runs: question, answer, tools, tokens, latency
```

## Tools

| Tool                   | Input                   | Returns                                                               |
| ---------------------- | ----------------------- | --------------------------------------------------------------------- |
| `get_store_overview`   | —                       | customers per segment, revenue 30/90d, average ticket, best sellers   |
| `find_customers`       | `segment`, `limit ≤ 50` | id, first name, orders, LTV, average ticket, days since last purchase |
| `get_customer_profile` | `customer_id`           | metrics, marketing consent, last 10 orders with items                 |

All of them reuse `lib/crm/queries.ts`, which has integration tests.

## Principles

- **Read-only**: no tool writes to the database or sends messages. Actions with side effects
  always belong to a human.
- **Data minimization (LGPD)**: the model receives first name and internal id — never email,
  phone or last name. It only suggests marketing for customers who gave consent.
- **Values pre-formatted in R$**: the model does no money arithmetic.
- **Store data is data**: names and product titles may contain malicious text (prompt
  injection); the prompt tells the model to treat them as data, and the tools allow no dangerous
  action even if it complied.
- **Controlled cost**: quota (`AGENT_DAILY_LIMIT` per rolling 24 h), bounded iterations, static
  (cacheable) prompt and tokens recorded per run.
- **Refusals**: server-side refusal fallback (`fallbacks: "default"`) and explicit handling of
  `stop_reason: "refusal"` with a clear message.

## Configuration

| Variable            | Default                                            |
| ------------------- | -------------------------------------------------- |
| `ANTHROPIC_API_KEY` | — (without a key, the page shows "not configured") |
| `ANTHROPIC_MODEL`   | `claude-opus-5-5`                                  |
| `AGENT_DAILY_LIMIT` | `20`                                               |

## Audit

```sql
select created_at, question, input_tokens, output_tokens, duration_ms, error
from agent_runs order by created_at desc limit 20;
```

## Limitations

No automated evaluation, single-turn, rolling-window quota, prompt injection mitigated but not
impossible, data sent to a third party: see [`limitations.md`](limitations.md), items G1–G5.
