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
- **Bring your own key**: each user saves their own Anthropic API key on the agent page
  (AES-256-GCM encrypted in `agent_credentials`, never returned or logged; the UI shows only the
  last 4 characters). The server key `ANTHROPIC_API_KEY` is used **only** by the emails in
  `AGENT_OWNER_EMAILS`, and only when they have no key of their own; everyone else, the demo user
  included, must bring a key. A key rejected by Anthropic (401/403) gets a specific message.
- **Shared demo account**: the demo login (`DEMO_EMAIL`) is used by several people, so its key is
  bound to the _session_ (`agent_credentials.sessionId`, cascade): it is deleted at sign-out, and
  another visitor signed in to the same account never sees or uses it. The demo account never gets
  the operator key, even if listed in `AGENT_OWNER_EMAILS`. A malformed `ANTHROPIC_API_KEY` is
  ignored (logged as `env.invalid_anthropic_key`): it disables the agent for owners, nothing else.
- **Controlled cost**: quota on the operator key (`AGENT_DAILY_LIMIT` per rolling 24 h; users on their own key are not limited), bounded iterations, static (cacheable) prompt and tokens recorded per run.
- **Refusals**: server-side refusal fallback (`fallbacks: "default"`) and explicit handling of
  `stop_reason: "refusal"` with a clear message.

## Configuration

| Variable             | Default                                                   |
| -------------------- | --------------------------------------------------------- |
| `ANTHROPIC_API_KEY`  | — (operator key, used only by `AGENT_OWNER_EMAILS`)       |
| `AGENT_OWNER_EMAILS` | — (comma-separated; empty = nobody uses the operator key) |
| `ANTHROPIC_MODEL`    | `claude-opus-5-5`                                         |
| `AGENT_DAILY_LIMIT`  | `20`                                                      |

## Audit

```sql
select created_at, question, input_tokens, output_tokens, duration_ms, error
from agent_runs order by created_at desc limit 20;
```

## Limitations

No automated evaluation, single-turn, rolling-window quota, prompt injection mitigated but not
impossible, data sent to a third party: see [`limitations.md`](limitations.md), items G1–G5.
