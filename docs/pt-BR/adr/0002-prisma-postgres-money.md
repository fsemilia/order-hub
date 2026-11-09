# 0002 — Prisma 7 + PostgreSQL, dinheiro em Decimal, agregados desnormalizados

🌐 [English](../../en/adr/0002-prisma-postgres-money.md) · **Português** · [Italiano](../../it/adr/0002-prisma-postgres-money.md)

- **Status:** aceita
- **Data:** 2026-11-09

## Contexto

Dados relacionais (clientes, pedidos, itens) com dinheiro e consultas de CRM filtradas e
paginadas por LTV e recência.

## Decisão

- PostgreSQL (Supabase em produção) com Prisma 7 (`prisma-client` + `@prisma/adapter-pg`).
- Dinheiro: `Decimal(12,2)` no banco, centavos inteiros em JS. Preços da Shopify (strings
  decimais) vão direto para `Prisma.Decimal`, sem passar por `float`.
- `ordersCount`, `totalSpent`, `firstOrderAt`, `lastOrderAt` desnormalizados em `customers`,
  **recalculados do zero** a partir dos pedidos na mesma transação de cada escrita.
- Segmento calculado em tempo de consulta (depende de "hoje").

## Consequências

- (+) Lista de clientes filtrada/ordenada/paginada inteiramente no banco, com índices.
- (+) Recalcular (em vez de incrementar) torna o processamento idempotente e correto com
  reembolsos e eventos fora de ordem.
- (−) Uma consulta agregada extra por webhook de pedido — barata (índice `customerId, placedAt`).
