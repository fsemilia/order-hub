# Collegare un negozio Shopify

🌐 [English](../en/shopify-setup.md) · [Português](../pt-BR/shopify-setup.md) · **Italiano**

Order Hub gestisce **più negozi**. Ogni negozio ha i propri clienti, ordini e carrelli
abbandonati, e il proprio secret di firma dei webhook, salvato cifrato (AES-256-GCM,
`STORE_SECRETS_KEY`). Il negozio demo (dati di esempio del seed) c'è sempre; i negozi reali si
aggiungono dalla pagina **Negozi**. Il selettore nell'intestazione e l'opzione "Dati demo /
Negozio reale" nel login scelgono quale negozio stai guardando.

> Le schermate di Shopify cambiano spesso. Se qualcosa qui sotto non corrisponde, usa il server
> MCP `shopify-dev-mcp` (configurato in `.mcp.json`) oppure https://shopify.dev/docs per verificare.

## 0. Development store

1. In [Shopify Partners](https://partners.shopify.com) → **Stores** → **Add store** →
   _Development store_ (gratuito, senza fatturazione).
2. In **Impostazioni → Pagamenti**, attiva il _Bogus Gateway_ (pagamenti di test) se vuoi fare
   ordini a mano.

## 1. URL pubblico

I webhook richiedono HTTPS pubblico:

- **Produzione/preview:** il deploy su Vercel (vedi [`deploy.md`](deploy.md)), es.
  `https://order-hub-lime.vercel.app/api/webhooks/shopify`
- **Locale:** un tunnel, es. `npx cloudflared tunnel --url http://localhost:3000` (o ngrok).

La pagina **Negozi** mostra l'URL esatto del webhook del deploy che stai usando.

## 2. Webhook (Percorso A — webhook del negozio, il più rapido)

1. Admin del negozio → **Impostazioni → Notifiche → Webhook** → **Crea webhook**.
2. Formato **JSON**, l'URL del passo 1, ultima versione dell'API. Crea un webhook per evento:
   `Creazione ordine`, `Aggiornamento ordine`, `Pagamento ordine`, `Annullamento ordine`,
   `Creazione cliente`, `Aggiornamento cliente`, `Creazione checkout`, `Aggiornamento checkout`
   (topic `orders/create`, `orders/updated`, `orders/paid`, `orders/cancelled`,
   `customers/create`, `customers/update`, `checkouts/create`, `checkouts/update`).
3. In fondo alla pagina Shopify mostra la chiave che firma questi webhook ("I tuoi webhook
   saranno firmati con…"). **Trattala come una password**: non incollarla in chat né nei commit.
   Se è stata esposta, ruotala dalla stessa pagina.

## 3. Aggiungere il negozio in Order Hub

1. Accedi → **Negozi** → _Collega un negozio Shopify_.
2. Nome, dominio del negozio (`sitoweb1.myshopify.com`; un URL incollato come
   `https://sitoweb1.myshopify.com/admin` viene normalizzato), valuta e il secret del passo 2.3.
3. Il nuovo negozio diventa quello attuale. Usa **Invia notifica di test** su Shopify e controlla
   la scheda del negozio: "Ultimo webhook" si aggiorna e il log mostra `webhook.processed`.

Come i webhook vengono associati ai negozi: Shopify invia `X-Shopify-Shop-Domain`; Order Hub
cerca quel negozio, decifra il **suo** secret e verifica l'HMAC. Negozio sconosciuto e firma non
valida ricevono lo stesso `401`, così l'endpoint non rivela quali negozi esistono. Dopo aver
ruotato il secret su Shopify, incolla quello nuovo in _Aggiorna il secret di firma_ nella scheda.

## 4. Dati di test nel negozio reale

Due script riempiono un development store con dati realistici passando da Shopify stessa, così
arrivano a Order Hub dai webhook reali (usano la [Shopify CLI](https://shopify.dev/docs/api/shopify-cli);
`npx` la scarica se non è installata).

```bash
# una volta, in un terminale normale (apre il browser per approvare gli scope)
npx @shopify/cli@5.0.1 store auth --store sitoweb1.myshopify.com \
  --scopes write_products,write_customers,write_orders,read_publications,write_publications

# prodotti, clienti e ordini retrodatati (transazioni di test, alcuni rimborsati/in attesa/annullati)
npm run shopify:populate -- --store sitoweb1.myshopify.com --customers 25 --orders 40

# checkout abbandonati dallo storefront (Playwright); password: Negozio online → Preferenze
SHOPIFY_STOREFRONT_PASSWORD='…' npm run shopify:abandon -- --store sitoweb1.myshopify.com --count 6
```

- La valuta del negozio in Order Hub deve essere quella del negozio Shopify (lo script la
  stampa, es. `EUR`): gli importi sono formattati nella valuta del negozio.
- Tutto ha il tag `order-hub-demo`; prodotti e clienti vengono riutilizzati se rilanci.
- Le email dei clienti usano `@example.com` e non viene inviata nessuna ricevuta.
- Gli ordini sono creati con `test: true` e transazioni di test: nessun pagamento reale.
- I development store accettano **5 nuovi ordini al minuto**: 40 ordini richiedono ~9 minuti.
- Gli ordini sono retrodatati con `processedAt`, che Order Hub usa come data dell'ordine, così
  compaiono tutti i segmenti (nuovo, ricorrente, a rischio).
- Limiti: [`limitations.md`](limitations.md), voci D5 e D6.

## Percorso B — app (come funzionerebbe in produzione per molti merchant)

[`shopify.app.toml`](../../shopify.app.toml) dichiara già i topic, compresi i webhook di privacy
obbligatori (`customers/redact`, `customers/data_request`, `shop/redact`). Oggi solo
`customers/redact` viene elaborato; vedi [`limitations.md`](limitations.md), voci F1 e F4.

1. Crea l'app nel Dev Dashboard (oppure `shopify app init`, "build an app without a template") e
   copia il `client_id` nel TOML.
2. Sostituisci gli URL nel TOML con quelli del tuo deploy.
3. In **API access → Protected customer data**, chiedi l'accesso a nome, email e telefono; senza,
   i webhook arrivano senza i campi del cliente.
4. `shopify app deploy` pubblica la configurazione (scope + sottoscrizioni ai webhook).
5. Installa l'app sul negozio e aggiungi il negozio in Order Hub con il **Client secret** dell'app
   come secret di firma (i webhook dell'app sono firmati con quello).

## Test in locale senza negozio

```bash
npm run db:seed        # negozio demo + un negozio locale "order-hub-dev.myshopify.com" (variabili LOCAL_*)
npm run webhook:send   # orders/create firmato per il negozio locale
npm run webhook:send -- --topic checkouts/create --fixture tests/fixtures/checkouts-create.json
```

## Risoluzione dei problemi

| Sintomo                           | Causa probabile                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `401 invalid signature`           | negozio non aggiunto in Order Hub, dominio diverso da `X-Shopify-Shop-Domain` o secret errato/ruotato (aggiornalo)       |
| Tutti i negozi rispondono 401     | `STORE_SECRETS_KEY` è cambiata: i secret vanno reinseriti (limite R7)                                                    |
| Ordine senza nome/email           | manca l'accesso a _protected customer data_ (Percorso B)                                                                 |
| `422 invalid payload`             | versione API diversa con campi nuovi/mancanti; guarda il log `webhook.invalid_payload` e adegua `lib/shopify/schemas.ts` |
| Nessun carrello abbandonato       | webhook dei checkout non creati, oppure il carrello non è mai arrivato al passo contatti del checkout                    |
| Shopify ha disattivato il webhook | l'endpoint ha fallito ripetutamente (stato ≠ 2xx); correggi e ricrea la sottoscrizione                                   |
