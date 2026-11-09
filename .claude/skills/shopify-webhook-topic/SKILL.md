---
name: shopify-webhook-topic
description: Add or change handling of a Shopify webhook topic in Order Hub (orders/*, customers/*, refunds/*, products/*, compliance topics). Use when the user asks to "handle a new webhook", "subscribe to X", "process refunds/create", or changes how a webhook payload is stored.
---

# Adding a Shopify webhook topic

The pipeline lives in `lib/shopify/webhooks.ts` (`handleShopifyWebhook`). Never bypass it: it owns
HMAC verification, the idempotency log and the transaction. A new topic is a handler, not a new route.

## Steps

1. **Check the payload shape** before writing code. Use the Shopify Dev MCP (`shopify-dev-mcp`
   server in `.mcp.json`) to read the webhook reference for the topic and the API version pinned in
   `shopify.app.toml` (`[webhooks] api_version`). Do not guess field names.
2. **Schema** — add a Zod schema in `lib/shopify/schemas.ts`:
   - IDs: `shopifyId` helper (number|string → string).
   - Money: `money` helper (decimal _string_). Never `z.number()` for prices.
   - Dates: `isoDate` helper.
   - Only the fields we use; unknown fields are stripped.
3. **Domain function** in `lib/shopify/ingest.ts` taking `(tx: Prisma.TransactionClient, parsed)`:
   - Must be idempotent (upsert by `shopifyId`, never blind `create`).
   - Respect the stale guard pattern (`shopifyUpdatedAt`) for resources that have `updated_at`.
   - If it changes orders, call `recomputeCustomerAggregates(tx, customerId)` in the same tx.
   - Never resurrect PII of a customer with `redactedAt` set.
4. **Register** the topic in `HANDLERS` (`lib/shopify/webhooks.ts`).
5. **Subscribe** in `shopify.app.toml` under `[[webhooks.subscriptions]]`.
6. **Fixture** in `tests/fixtures/<topic>.json` with realistic, _13-digit_ IDs (JSON.parse loses
   precision above 2^53 — Shopify IDs fit, invented 18-digit ones do not).
7. **Tests** in `tests/integration/shopify-webhook.test.ts` using the `deliver()` helper. Minimum:
   happy path, duplicate delivery (same webhook id), invalid payload → 422 with nothing written,
   and out-of-order delivery if the resource has `updated_at`.
8. Run `npm run test:integration` (needs `npm run db:test:start`) and `npm run check`.
9. Manual check: `npm run webhook:send -- --topic <topic> --fixture tests/fixtures/<topic>.json`.

## Response codes (do not change without an ADR)

| Situation            | Status                 | Why                             |
| -------------------- | ---------------------- | ------------------------------- |
| Bad HMAC             | 401                    | not from Shopify                |
| Duplicate webhook id | 200 `{duplicate:true}` | stop Shopify retries            |
| Invalid payload      | 422, rolled back       | logged; fixable then replayable |
| Unknown topic        | 200 `{ignored}`        | avoid retry storms              |
| Anything else        | throw → 500            | Shopify retries with backoff    |
