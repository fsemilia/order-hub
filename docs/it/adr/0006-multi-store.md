# 0006 — Multi-negozio con secret dei webhook cifrati per negozio

🌐 [English](../../en/adr/0006-multi-store.md) · [Português](../../pt-BR/adr/0006-multi-store.md) · **Italiano**

- **Stato:** accettata
- **Data:** 2026-11-09

## Contesto

Il team lavora con più merchant e vuole tenere i dati demo accanto ai negozi Shopify reali. Finora
c'era un solo secret dei webhook in una variabile d'ambiente e i dati di due negozi si sarebbero
mescolati. Gli id Shopify sono unici solo all'interno di un negozio.

## Decisione

- Una tabella `Store` (`DEMO` | `SHOPIFY`); `storeId` su clienti, ordini, checkout ed eventi
  webhook; le chiavi univoche diventano `(storeId, shopifyId)`. La migration è expand → backfill →
  contract: le righe esistenti passano a un negozio fisso `demo`, così i dati di produzione
  sopravvivono.
- La route dei webhook ricava il negozio da `X-Shopify-Shop-Domain` e verifica l'HMAC con il
  secret **di quel negozio**. Negozio sconosciuto e firma non valida rispondono con lo stesso `401`.
- I secret si inseriscono dall'interfaccia e sono salvati cifrati con AES-256-GCM
  (`STORE_SECRETS_KEY`, formato versionato `v1.`). Non tornano mai al browser né finiscono nei log.
- Ogni query riceve uno `storeId`; `requireStoreContext()` restituisce l'utente e il negozio
  attuale (cookie `oh_store`, riconvalidato sul database a ogni richiesta). Gli strumenti
  dell'agente sono vincolati a quel negozio dal server.
- Le consegne duplicate si riconoscono con `createMany({ skipDuplicates })` sul log degli eventi:
  una violazione di unicità altrove (due consegne dello stesso ordine in concorrenza) non viene più
  scambiata per un duplicato e viene ritentata.

## Conseguenze

- (+) Negozi reali e dati demo fianco a fianco; cambiare negozio è un clic.
- (+) Un dump del database trapelato non espone secret dei webhook utilizzabili senza la chiave.
- (−) I negozi si collegano a mano (niente installazione OAuth), ogni utente gestisce tutti i
  negozi e la chiave non ha strumenti di rotazione: [limitations.md](../limitations.md), voci F1, A5, R7.
