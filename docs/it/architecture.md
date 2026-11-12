# Architettura

🌐 [English](../en/architecture.md) · [Português](../pt-BR/architecture.md) · **Italiano**

## Panoramica

Un'unica app Next.js (monolite modulare) pubblicata su Vercel, con PostgreSQL gestito (Supabase,
regione San Paolo). Non c'è un backend separato: i Route Handler ricevono i webhook, i Server
Components leggono direttamente il database e le Server Actions eseguono le modifiche e l'agente.

```text
             ┌─────────────── Vercel (gru1) ───────────────┐
Shopify ───▶ │ /api/webhooks/shopify  → lib/shopify/*      │
             │ /api/auth/*            → Better Auth        │ ───▶ Supabase Postgres
Team ──────▶ │ proxy.ts → app/[locale]/* → lib/crm/queries    │      (pooler 6543)
             │ Server Action → lib/agent → Anthropic API   │
             └─────────────────────────────────────────────┘
```

## Il percorso di un webhook

1. `route.ts` legge il **body grezzo** (`req.text()`): l'HMAC è calcolato sui byte esatti.
2. Il negozio viene ricavato da `X-Shopify-Shop-Domain` e il suo secret dei webhook viene decifrato
   (AES-256-GCM, `STORE_SECRETS_KEY`). Negozio sconosciuto → `401`, la stessa risposta di una firma non valida.
3. `verifyShopifyHmac` confronta la firma in tempo costante con il secret **di quel negozio**.
4. Header obbligatori (`X-Shopify-Webhook-Id`, `X-Shopify-Topic`).
5. **Una sola transazione**:
   - inserisce `webhook_events(id)` con `skipDuplicates` — se l'id esiste già → `200 {duplicate: true}`;
   - valida il payload con Zod (non valido → `422` e rollback, non viene scritto nulla);
   - esegue l'handler del topic (upsert di ordine, righe, cliente, checkout) per quello `storeId`;
   - ricalcola gli aggregati del cliente a partire dai suoi ordini.
6. Qualsiasi altro errore diventa `500` e Shopify ritenta con backoff.

### Garanzie

| Problema reale                            | Gestione                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| Consegna duplicata (at-least-once)        | log degli eventi con PK = id del webhook                                      |
| Stesso ordine reinviato con un altro id   | `upsert` per `(storeId, shopifyId)`                                           |
| `orders/updated` prima di `orders/create` | `upsert` + controllo su `updated_at` (gli eventi più vecchi vengono ignorati) |
| Rimborso / modifica dell'ordine           | `current_total_price` + ricalcolo completo degli aggregati                    |
| Errore a metà elaborazione                | transazione: tutto o niente                                                   |
| Ordine senza cliente (checkout ospite)    | ordine salvato con `customerId = null`                                        |
| Richiesta di cancellazione (LGPD)         | `customers/redact` anonimizza e impedisce che i dati personali ritornino      |

I limiti di queste garanzie (es. consegne concorrenti dello stesso ordine, elaborazione sincrona)
sono in [`limitations.md`](limitations.md), voci R1–R2.

## Modello dati

- `stores` — una riga per negozio: `DEMO` (dati del seed, id `demo`) o `SHOPIFY` (dominio, valuta,
  secret dei webhook cifrato). Tutte le tabelle qui sotto hanno uno `storeId`.
- `checkouts` — checkout Shopify; mai completato = carrello abbandonato (articoli, valore, link di recupero).
- `customers` — dati del cliente + aggregati denormalizzati (`ordersCount`, `totalSpent`,
  `firstOrderAt`, `lastOrderAt`) con indici su `lastOrderAt` e `totalSpent`.
- `orders`, `order_line_items` — ordini e righe; `totalPrice` in `Decimal(12,2)`.
- `webhook_events` — log di idempotenza.
- `agent_runs` — registro dell'agente (domanda, risposta, tool, token, latenza, origine della chiave).
- `agent_credentials` — chiavi Anthropic personali degli utenti, cifrate (AES-256-GCM); la chiave
  salvata dall'utente demo condiviso è legata alla sessione e viene cancellata al logout.
- `user`, `session`, `account`, `verification` — Better Auth.

Il **segmento** non viene salvato perché dipende dalla data corrente. La regola è in
`lib/crm/segments.ts` in due forme equivalenti e testate: `segmentOf` (JS) e `segmentWhere`
(filtro Prisma, così filtra e pagina il database).

## Autenticazione e autorizzazione

- `proxy.ts`: controllo ottimistico del cookie di sessione (senza accesso al database) e redirect
  a `/login`.
- `lib/session.ts` (Data Access Layer): `requireUser()` valida la sessione sul database. Viene
  chiamato in ogni pagina, Server Action e route che tocca dati dei clienti. Un cookie falsificato
  supera il proxy, mai la DAL.
- `lib/stores/current.ts`: `requireStoreContext()` = `requireUser()` + il negozio attuale (cookie
  `oh_store`, riconvalidato sul database; sconosciuto → negozio demo). Ogni query riceve quello
  `storeId`, quindi un id di un altro negozio risulta "non trovato".
- Nessuna registrazione pubblica. GitHub OAuth accetta solo le email in `ALLOWED_EMAILS`.

## Lingue

L'interfaccia è in inglese (predefinito), portoghese e italiano. Le pagine stanno in `app/[locale]`;
gli URL non hanno prefisso perché `proxy.ts` li riscrive dal cookie `oh_locale`. I dizionari sono
tipizzati (`lib/i18n`) e gli importi sono formattati con `Intl` nella valuta del negozio. Vedi ADR 0007.

## Rendering (Cache Components)

La struttura della pagina (navigazione, titoli) è prerenderizzata in modo statico. Tutto ciò che
dipende dalla richiesta (sessione, `searchParams`, `params`, `usePathname`) sta dentro
`<Suspense>` e arriva in streaming. `next build` fallisce se questa regola viene violata.

## Osservabilità

- Log strutturati in JSON (`lib/logger.ts`) con id del webhook, topic e risultato.
- `/api/health` verifica il database (per i monitor di uptime).
- `agent_runs` registra costo (token) e latenza di ogni esecuzione dell'agente.
