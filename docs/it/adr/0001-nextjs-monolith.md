# 0001 — Monolite Next.js (App Router) con Cache Components

🌐 [English](../../en/adr/0001-nextjs-monolith.md) · [Português](../../pt-BR/adr/0001-nextjs-monolith.md) · **Italiano**

- **Stato:** accettata
- **Data:** 2026-11-09

## Contesto

Team piccolo, prodotto interno, integrazioni via webhook e una dashboard. Serve consegnare in
fretta senza rinunciare a tipi end-to-end e test.

## Decisione

Un'unica app Next.js 16: Route Handler per webhook e auth, Server Components che leggono il
database tramite `lib/crm/queries.ts`, Server Actions per le modifiche e per l'agente.
`cacheComponents` attivo: struttura statica + contenuto dipendente dalla richiesta dentro
`<Suspense>`.

## Conseguenze

- (+) Un deploy, un repository, un solo sistema di tipi; una preview per ogni PR su Vercel.
- (+) La logica di dominio vive in `lib/` senza dipendere da Next, quindi è testabile da sola.
- (−) Webhook e UI scalano insieme; se il volume cresce, l'elaborazione passa a una coda
  (ADR 0003) senza cambiare il dominio.
- (−) Cache Components richiede disciplina (Suspense per i dati della richiesta); la build lo
  impone.
