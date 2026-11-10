# 0006 — Multi-store with per-store encrypted webhook secrets

🌐 **English** · [Português](../../pt-BR/adr/0006-multi-store.md) · [Italiano](../../it/adr/0006-multi-store.md)

- **Status:** accepted
- **Date:** 2026-11-09

## Context

The team works with several merchants and wants to keep the demo data next to real Shopify
stores. Until now there was one webhook secret in an environment variable and the data of two
stores would have been mixed. Shopify ids are only unique within a shop.

## Decision

- A `Store` table (`DEMO` | `SHOPIFY`); `storeId` on customers, orders, checkouts and webhook
  events; unique keys become `(storeId, shopifyId)`. The migration is expand → backfill →
  contract: existing rows move to a fixed `demo` store, so production data survives.
- The webhook route resolves the store from `X-Shopify-Shop-Domain` and verifies the HMAC with
  **that store's** secret. Unknown shop and bad signature return the same `401`.
- Secrets are entered in the UI and stored encrypted with AES-256-GCM (`STORE_SECRETS_KEY`,
  versioned `v1.` format). They are never returned to the browser or logged.
- Every read model takes a `storeId`; `requireStoreContext()` returns the user and the current
  store (cookie `oh_store`, re-validated against the database on each request). The agent's tools
  are bound to that store by the server.
- Duplicate deliveries are detected with `createMany({ skipDuplicates })` on the event log: a
  unique violation elsewhere (two deliveries of the same order racing) is no longer mistaken for
  a duplicate and is retried.

## Consequences

- (+) Real stores and demo data side by side; switching store is one click.
- (+) A leaked database dump does not expose usable webhook secrets without the key.
- (−) Stores are connected by hand (no OAuth install), any user manages every store, and the
  encryption key has no rotation tooling: [limitations.md](../limitations.md), items F1, A5, R7.
