# Architecture

🌐 **English** · [Português](../pt-BR/architecture.md) · [Italiano](../it/architecture.md)

## Overview

A single Next.js app (modular monolith) deployed on Vercel, with managed PostgreSQL (Supabase,
São Paulo region). There is no separate backend: Route Handlers receive webhooks, Server
Components read the database directly and Server Actions run mutations and the agent.

```text
             ┌─────────────── Vercel (gru1) ───────────────┐
Shopify ───▶ │ /api/webhooks/shopify  → lib/shopify/*      │
             │ /api/auth/*            → Better Auth        │ ───▶ Supabase Postgres
Team ──────▶ │ proxy.ts → app/[locale]/* → lib/crm/queries    │      (pooler 6543)
             │ Server Action → lib/agent → Anthropic API   │
             └─────────────────────────────────────────────┘
```

## Life of a webhook

1. `route.ts` reads the **raw body** (`req.text()`): the HMAC is computed over the exact bytes.
2. The store is resolved from `X-Shopify-Shop-Domain` and its webhook secret is decrypted
   (AES-256-GCM, `STORE_SECRETS_KEY`). Unknown shop → `401`, the same answer as a bad signature.
3. `verifyShopifyHmac` compares the signature in constant time with **that store's** secret.
4. Required headers (`X-Shopify-Webhook-Id`, `X-Shopify-Topic`).
5. **One transaction**:
   - insert `webhook_events(id)` with `skipDuplicates` — if the id already exists → `200 {duplicate: true}`;
   - validate the payload with Zod (invalid → `422` and rollback, nothing is written);
   - run the topic handler (upsert of order, line items, customer, checkout) for that `storeId`;
   - recompute the customer's aggregates from their orders.
6. Any other error surfaces as `500` and Shopify retries with backoff.

### Guarantees

| Real-world problem                      | Handling                                                        |
| --------------------------------------- | --------------------------------------------------------------- |
| Duplicate delivery (at-least-once)      | event log with PK = webhook id                                  |
| Same order resent with a different id   | `upsert` by `(storeId, shopifyId)`                              |
| `orders/updated` before `orders/create` | `upsert` + `updated_at` guard (older events are ignored)        |
| Refund / order edit                     | `current_total_price` + full recomputation of aggregates        |
| Failure halfway through                 | transaction: all or nothing                                     |
| Order without customer (guest checkout) | order stored with `customerId = null`                           |
| Deletion request (LGPD)                 | `customers/redact` anonymizes and prevents PII from coming back |

The limits of these guarantees (e.g. concurrent deliveries of the same order, synchronous
processing) are in [`limitations.md`](limitations.md), items R1–R2.

## Data model

- `stores` — one row per store: `DEMO` (seed data, id `demo`) or `SHOPIFY` (shop domain,
  currency, encrypted webhook secret). Every table below has a `storeId`.
- `checkouts` — Shopify checkouts; never completed = abandoned cart (items, value, recovery link).
- `customers` — customer data + denormalized aggregates (`ordersCount`, `totalSpent`,
  `firstOrderAt`, `lastOrderAt`) with indexes on `lastOrderAt` and `totalSpent`.
- `orders`, `order_line_items` — orders and items; `totalPrice` as `Decimal(12,2)`.
- `webhook_events` — idempotency log.
- `agent_runs` — agent audit log (question, answer, tools, tokens, latency, key source).
- `agent_credentials` — users' own Anthropic keys, encrypted (AES-256-GCM); a key saved by the
  shared demo user is bound to its session and deleted at sign-out.
- `user`, `session`, `account`, `verification` — Better Auth.

The **segment** is not stored because it depends on the current date. The rule lives in
`lib/crm/segments.ts` in two equivalent, tested forms: `segmentOf` (JS) and `segmentWhere`
(Prisma filter, so the database filters and paginates).

## Authentication and authorization

- `proxy.ts`: optimistic check of the session cookie (no database access) and redirect to `/login`.
- `lib/session.ts` (Data Access Layer): `requireUser()` validates the session against the
  database. It is called in every page, Server Action and route that touches customer data. A
  forged cookie gets past the proxy, never past the DAL.
- `lib/stores/current.ts`: `requireStoreContext()` = `requireUser()` + the current store (cookie
  `oh_store`, re-validated in the database; unknown → demo store). Every query takes that `storeId`,
  so an id from another store is "not found".
- No public sign-up. GitHub OAuth only admits emails listed in `ALLOWED_EMAILS`.

## Languages

The UI is in English (default), Portuguese and Italian. Pages live under `app/[locale]`; URLs have
no prefix because `proxy.ts` rewrites them from the `oh_locale` cookie. Dictionaries are typed
(`lib/i18n`) and money is formatted with `Intl` in the store currency. See ADR 0007.

## Rendering (Cache Components)

The page shell (navigation, titles) is prerendered statically. Everything that depends on the
request (session, `searchParams`, `params`, `usePathname`) lives inside `<Suspense>` and is
streamed. `next build` fails if this rule is broken.

## Observability

- Structured JSON logs (`lib/logger.ts`) with webhook id, topic and result.
- `/api/health` checks the database (for uptime monitors).
- `agent_runs` records cost (tokens) and latency of every agent run.
