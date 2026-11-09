# 0003 — Synchronous, idempotent webhook processing

🌐 **English** · [Português](../../pt-BR/adr/0003-webhook-processing.md) · [Italiano](../../it/adr/0003-webhook-processing.md)

- **Status:** accepted
- **Date:** 2026-11-09

## Context

Shopify delivers webhooks _at least once_, with no ordering guarantee, and expects a 2xx response
within 5 seconds; repeated failures disable the subscription.

## Decision

Process inside the request, in a single transaction:
HMAC → `webhook_events` log (PK = `X-Shopify-Webhook-Id`) → Zod validation → upsert → recompute.
Duplicates return 200; invalid payload 422 with rollback; other errors 500 (Shopify retries).
Events with an `updated_at` older than the stored one are ignored.

## Alternatives

- **Queue (Inngest, QStash, SQS)**: responds 200 immediately and processes later with its own
  retries. Better under peaks (Black Friday), but adds infrastructure. At the current volume the
  transaction takes a few milliseconds.

## Consequences

- (+) Simple, testable end to end (`tests/integration/shopify-webhook.test.ts`).
- (−) Trigger to revisit: webhook p95 > 1 s or peaks above a few dozen per second. The migration is
  local: `handleShopifyWebhook` becomes the queue consumer.
- (−) Known limits: see [limitations.md](../limitations.md), items R1–R2.
