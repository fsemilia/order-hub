# 0002 — Prisma 7 + PostgreSQL, money as Decimal, denormalized aggregates

🌐 **English** · [Português](../../pt-BR/adr/0002-prisma-postgres-money.md) · [Italiano](../../it/adr/0002-prisma-postgres-money.md)

- **Status:** accepted
- **Date:** 2026-11-09

## Context

Relational data (customers, orders, line items) with money, and CRM queries filtered and
paginated by LTV and recency.

## Decision

- PostgreSQL (Supabase in production) with Prisma 7 (`prisma-client` + `@prisma/adapter-pg`).
- Money: `Decimal(12,2)` in the database, integer cents in JS. Shopify prices (decimal strings)
  go straight into `Prisma.Decimal`, never through a `float`.
- `ordersCount`, `totalSpent`, `firstOrderAt`, `lastOrderAt` denormalized on `customers`,
  **recomputed from scratch** from the orders in the same transaction as every write.
- Segment computed at query time (it depends on "today").

## Consequences

- (+) Customer list filtered, sorted and paginated entirely in the database, with indexes.
- (+) Recomputing (instead of incrementing) makes processing idempotent and correct with
  refunds and out-of-order events.
- (−) One extra aggregate query per order webhook — cheap (index on `customerId, placedAt`).
