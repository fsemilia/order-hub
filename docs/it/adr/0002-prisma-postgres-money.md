# 0002 — Prisma 7 + PostgreSQL, denaro in Decimal, aggregati denormalizzati

🌐 [English](../../en/adr/0002-prisma-postgres-money.md) · [Português](../../pt-BR/adr/0002-prisma-postgres-money.md) · **Italiano**

- **Stato:** accettata
- **Data:** 2026-11-09

## Contesto

Dati relazionali (clienti, ordini, righe) con importi in denaro e query CRM filtrate e paginate
per LTV e recency.

## Decisione

- PostgreSQL (Supabase in produzione) con Prisma 7 (`prisma-client` + `@prisma/adapter-pg`).
- Denaro: `Decimal(12,2)` nel database, centesimi interi in JS. I prezzi di Shopify (stringhe
  decimali) vanno direttamente in `Prisma.Decimal`, senza passare da un `float`.
- `ordersCount`, `totalSpent`, `firstOrderAt`, `lastOrderAt` denormalizzati su `customers`,
  **ricalcolati da zero** a partire dagli ordini nella stessa transazione di ogni scrittura.
- Segmento calcolato al momento della query (dipende da "oggi").

## Conseguenze

- (+) Lista clienti filtrata, ordinata e paginata interamente nel database, con indici.
- (+) Ricalcolare (invece di incrementare) rende l'elaborazione idempotente e corretta con
  rimborsi ed eventi fuori ordine.
- (−) Una query di aggregazione in più per ogni webhook di ordine — economica (indice su
  `customerId, placedAt`).
