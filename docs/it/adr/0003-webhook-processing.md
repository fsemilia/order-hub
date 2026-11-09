# 0003 — Elaborazione sincrona e idempotente dei webhook

🌐 [English](../../en/adr/0003-webhook-processing.md) · [Português](../../pt-BR/adr/0003-webhook-processing.md) · **Italiano**

- **Stato:** accettata
- **Data:** 2026-11-09

## Contesto

Shopify consegna i webhook _almeno una volta_, senza garanzia d'ordine, e si aspetta una risposta
2xx entro 5 secondi; errori ripetuti disattivano la sottoscrizione.

## Decisione

Elaborare dentro la richiesta, in un'unica transazione:
HMAC → log `webhook_events` (PK = `X-Shopify-Webhook-Id`) → validazione Zod → upsert → ricalcolo.
I duplicati rispondono 200; payload non valido 422 con rollback; altri errori 500 (Shopify ritenta).
Gli eventi con `updated_at` più vecchio di quello salvato vengono ignorati.

## Alternative

- **Coda (Inngest, QStash, SQS)**: risponde subito 200 ed elabora dopo con i propri retry. Migliore
  sotto i picchi (Black Friday), ma aggiunge infrastruttura. Con il volume attuale la transazione
  dura pochi millisecondi.

## Conseguenze

- (+) Semplice, testabile end-to-end (`tests/integration/shopify-webhook.test.ts`).
- (−) Quando rivederla: p95 del webhook > 1 s o picchi oltre qualche decina al secondo. La
  migrazione è locale: `handleShopifyWebhook` diventa il consumer della coda.
- (−) Limiti noti: vedi [limitations.md](../limitations.md), voci R1–R2.
