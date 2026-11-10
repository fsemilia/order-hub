# Retention agent

🌐 **English** · [Português](../pt-BR/agent.md) · [Italiano](../it/agent.md)

Answers questions about the customer base of the current store, including abandoned carts, and
drafts retention messages in the interface language (English, Portuguese or Italian).

## How it works

```text
Question (Server Action, authenticated, Zod)
  → per-user quota over the last 24 h (agent_runs)
  → Anthropic SDK tool runner (Claude, effort "medium", max 6 iterations)
      ↔ get_store_overview / find_customers / get_customer_profile / list_abandoned_checkouts   (read-only)
  → answer shown as an editable draft
  → agent_runs: question, answer, tools, tokens, latency
```

## Tools

| Tool                       | Input                   | Returns                                                                                       |
| -------------------------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| `get_store_overview`       | —                       | customers per segment, revenue 30/90d, average ticket, best sellers                           |
| `find_customers`           | `segment`, `limit ≤ 50` | id, first name, orders, LTV, average ticket, days since last purchase                         |
| `get_customer_profile`     | `customer_id`           | metrics, marketing consent, last 10 orders with items                                         |
| `list_abandoned_checkouts` | `limit ≤ 30`            | customer id, first name (null for guests), consent, items, value, days since the cart started |

All of them reuse `lib/crm/queries.ts`, which has integration tests.

## Principles

- **Read-only**: no tool writes to the database or sends messages. Actions with side effects
  always belong to a human.
- **Data minimization (LGPD)**: the model receives first name and internal id — never email,
  phone or last name. It only suggests marketing for customers who gave consent.
- **Values pre-formatted in the store currency**: the model does no money arithmetic.
- **Bound to the current store**: the server creates the tools with the `storeId` of the user's
  current store; the model cannot choose or see another store. Each run is stored with its `storeId`.
- **Answers in the UI language**: the system prompt is in English and a second block asks for
  English, Portuguese or Italian, following the interface.
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
