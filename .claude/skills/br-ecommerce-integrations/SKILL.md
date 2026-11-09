---
name: br-ecommerce-integrations
description: Reference for extending Order Hub beyond Shopify to the Brazilian e-commerce ecosystem — Mercado Livre (OAuth + notifications), Bling ERP (API v3), and Pix payment confirmation via webhooks (Mercado Pago, Pagar.me). Use when planning or building a new sales channel, ERP sync or payment integration.
---

# Brazilian e-commerce integrations (design notes)

These notes describe integration _patterns_. API details change: always confirm endpoints, scopes
and payloads in the official docs before coding (see links), and record decisions in `docs/adr/`.

## Architecture rule: one ingestion pipeline per channel, one domain model

Each channel gets: an auth module (OAuth tokens stored encrypted, refreshed proactively), a
webhook/notification receiver, a mapper `channel payload → Order/Customer`, and the same
guarantees as `lib/shopify/webhooks.ts`: signature/authenticity check, idempotency log,
single transaction, stale-update guard. Add a `channel` column (`shopify | mercado_livre | ...`)
and make `shopifyId` → `(channel, externalId)` unique — via expand/contract (skill `prisma-migration`).

## Mercado Livre

- Auth: OAuth 2.0 authorization code; access tokens are short-lived (hours) and refresh tokens
  rotate on use — persist the new refresh token every time.
- Notifications: ML POSTs a small JSON (`resource`, `topic`, `user_id`, ...) to the app callback
  URL, e.g. topic `orders_v2`. The notification carries no order data: you **GET the resource**
  with the seller's token. Respond 200 quickly; ML retries otherwise.
- Authenticity: there is no HMAC like Shopify's — validate by fetching the resource from the API
  (the source of truth) and by checking `user_id` belongs to a connected seller.
- Docs: https://developers.mercadolivre.com.br/

## Bling (ERP, API v3)

- OAuth 2.0 (authorization code), REST JSON, rate limited — queue writes and back off on 429.
- Typical flows: push paid orders to Bling (invoice/NF-e, stock), pull stock levels back.
- Idempotency on our side: store the Bling id returned for each order; never create twice.
- Docs: https://developer.bling.com.br/

## Pix confirmation (Mercado Pago / Pagar.me)

- Flow: create a charge → show QR code / copia-e-cola → customer pays in their bank app →
  PSP confirms asynchronously by **webhook** → mark order paid. Never trust the client redirect.
- Mercado Pago: webhook notification with the payment id; verify the `x-signature` header (HMAC
  with the webhook secret) and then GET the payment to read `status` (`approved`).
- Pagar.me: webhook events such as `order.paid` / `charge.paid`; verify the signature header and
  re-fetch the charge when in doubt.
- Charges expire: handle `expired`/`canceled`, and reconcile periodically (cron) in case a webhook
  was lost.
- Docs: https://www.mercadopago.com.br/developers · https://docs.pagar.me/

## Checklist for any new integration

- [ ] Secrets in env vars, documented in `.env.example` and `lib/env.ts`
- [ ] Signature or fetch-back verification
- [ ] Idempotency (event log + upserts) and out-of-order handling
- [ ] Integration tests with recorded fixtures
- [ ] LGPD: store only fields we use; handle deletion requests
- [ ] ADR explaining the choice
