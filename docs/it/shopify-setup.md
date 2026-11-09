# Collegare un development store Shopify

🌐 [English](../en/shopify-setup.md) · [Português](../pt-BR/shopify-setup.md) · **Italiano**

A Order Hub basta **ricevere i webhook**. Ci sono due strade; per la demo, parti dalla A.

> Le schermate di Shopify cambiano spesso. Se qualcosa qui sotto non corrisponde, usa il server
> MCP `shopify-dev-mcp` (configurato in `.mcp.json`) oppure https://shopify.dev/docs per verificare.

## 0. Development store

1. In [Shopify Partners](https://partners.shopify.com) → **Stores** → **Add store** →
   _Development store_ (gratuito, senza addebiti).
2. Nel negozio crea qualche prodotto (o usa **Generate test data**, se disponibile).
3. In **Settings → Payments** attiva il _Bogus Gateway_ (pagamenti di prova) per chiudere ordini.

## 1. URL pubblico

I webhook richiedono un HTTPS pubblico:

- **Produzione/preview:** il deploy su Vercel (vedi [`deploy.md`](deploy.md)), es.
  `https://order-hub.vercel.app/api/webhooks/shopify`
- **Locale:** un tunnel, es. `npx cloudflared tunnel --url http://localhost:3000` (oppure ngrok).

## Strada A — webhook del negozio (la più rapida)

1. Admin del negozio → **Settings → Notifications → Webhooks** → **Create webhook**.
2. Evento `Order creation`, formato **JSON**, l'URL del passo 1, versione API più recente.
3. Ripeti per `Order update`, `Order payment`, `Order cancellation`, `Customer creation`,
   `Customer update`.
4. La pagina mostra la chiave usata per firmare i webhook ("Your webhooks will be signed with…").
   Copiala in `SHOPIFY_WEBHOOK_SECRET`.
5. Usa **Send test notification** e controlla il log (`webhook.processed`) e la pagina _Clientes_.

## Strada B — app (come funzionerebbe in produzione per più commercianti)

[`shopify.app.toml`](../../shopify.app.toml) dichiara già i topic, compresi i webhook di privacy
obbligatori (`customers/redact`, `customers/data_request`, `shop/redact`). Oggi viene elaborato
solo `customers/redact`; vedi [`limitations.md`](limitations.md), voce F4.

1. Crea l'app nel Dev Dashboard (oppure `npm i -g @shopify/cli && shopify app init` e scegli
   "build an app without a template") e copia il `client_id` nel TOML.
2. Sostituisci `order-hub.vercel.app` nel TOML con il tuo URL.
3. In **API access → Protected customer data** richiedi l'accesso a nome, email e telefono; senza,
   i webhook arrivano senza i campi del cliente.
4. `shopify app deploy` pubblica la configurazione (scope + sottoscrizioni dei webhook).
5. Installa l'app sul development store.
6. `SHOPIFY_WEBHOOK_SECRET` = **Client secret** dell'app (Shopify firma i webhook con quello).
7. Opzionale: `SHOPIFY_SHOP_DOMAIN=tuo-negozio.myshopify.com` per rifiutare altri negozi.

## Prova

1. Fai un ordine nel negozio (Bogus Gateway: numero di carta `1`).
2. Trovi l'ordine in _Clientes_; la dashboard mostra "último webhook" (ultimo webhook).
3. Rimborsa in parte l'ordine dall'admin → `orders/updated` → l'LTV del cliente scende.
4. Senza negozio, simula tutto in locale: `npm run webhook:send` (vedi README).

## Problemi comuni

| Sintomo                             | Causa probabile                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `401 invalid signature`             | segreto sbagliato (Strada A: chiave della pagina webhook; B: client secret) oppure un proxy ha modificato il body        |
| Ordine senza nome/email del cliente | manca l'accesso ai _protected customer data_ (Strada B)                                                                  |
| `422 invalid payload`               | versione API diversa con campi nuovi/mancanti; vedi il log `webhook.invalid_payload` e aggiorna `lib/shopify/schemas.ts` |
| Shopify ha disattivato il webhook   | l'endpoint ha fallito ripetutamente (status ≠ 2xx); correggi e ricrea la sottoscrizione                                  |
