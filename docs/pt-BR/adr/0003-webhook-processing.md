# 0003 — Processamento síncrono e idempotente de webhooks

🌐 [English](../../en/adr/0003-webhook-processing.md) · **Português** · [Italiano](../../it/adr/0003-webhook-processing.md)

- **Status:** aceita
- **Data:** 2026-11-09

## Contexto

A Shopify entrega webhooks _at-least-once_, sem garantia de ordem, e espera resposta 2xx em
até 5 segundos; falhas repetidas desativam a inscrição.

## Decisão

Processar dentro da requisição, numa única transação:
HMAC → log `webhook_events` (PK = `X-Shopify-Webhook-Id`) → validação Zod → upsert → recálculo.
Duplicados retornam 200; payload inválido 422 com rollback; demais erros 500 (a Shopify reenvia).
Eventos com `updated_at` mais antigo que o gravado são ignorados.

## Alternativas

- **Fila (Inngest, QStash, SQS)**: responde 200 imediatamente e processa depois com retries
  próprios. Melhor sob picos (Black Friday), mas adiciona infraestrutura. Com o volume atual,
  a transação leva poucos milissegundos.

## Consequências

- (+) Simples, testável de ponta a ponta (`tests/integration/shopify-webhook.test.ts`).
- (−) Gatilho para revisar: p95 do webhook > 1 s ou picos acima de algumas dezenas por segundo.
  A migração é local: `handleShopifyWebhook` vira o consumidor da fila.
- (−) Limites conhecidos: ver [limitations.md](../limitations.md), itens R1–R2.
