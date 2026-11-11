# Connecting a Shopify store

🌐 **English** · [Português](../pt-BR/shopify-setup.md) · [Italiano](../it/shopify-setup.md)

Order Hub manages **several stores**. Each store has its own customers, orders and abandoned
carts, and its own webhook signing secret, stored encrypted (AES-256-GCM, `STORE_SECRETS_KEY`).
The demo store (sample data from the seed) is always there; real stores are added from the
**Stores** page. The header switcher and the "Demo data / Real store" toggle on the login page
choose which store you are looking at.

> Shopify's screens change often. If something below does not match, use the
> `shopify-dev-mcp` MCP server (configured in `.mcp.json`) or https://shopify.dev/docs to check.

## 0. Development store

1. In [Shopify Partners](https://partners.shopify.com) → **Stores** → **Add store** →
   _Development store_ (free, no billing).
2. In **Settings → Payments**, enable the _Bogus Gateway_ (test payments) if you want to place
   orders by hand.

## 1. Public URL

Webhooks need public HTTPS:

- **Production/preview:** the Vercel deployment (see [`deploy.md`](deploy.md)), e.g.
  `https://order-hub-lime.vercel.app/api/webhooks/shopify`
- **Local:** a tunnel, e.g. `npx cloudflared tunnel --url http://localhost:3000` (or ngrok).

The **Stores** page shows the exact webhook URL of the deployment you are using.

## 2. Webhooks (Path A — store webhooks, fastest)

1. Store admin → **Settings → Notifications → Webhooks** → **Create webhook**.
2. Format **JSON**, the URL from step 1, latest API version. Create one webhook per event:
   `Order creation`, `Order update`, `Order payment`, `Order cancellation`, `Customer creation`,
   `Customer update`, `Checkout creation`, `Checkout update`
   (topics `orders/create`, `orders/updated`, `orders/paid`, `orders/cancelled`,
   `customers/create`, `customers/update`, `checkouts/create`, `checkouts/update`).
3. At the bottom of that page Shopify shows the key that signs these webhooks ("Your webhooks
   will be signed with…"). **Treat it as a password**: do not paste it in chats or commits. If it
   was exposed, rotate it on the same page.

## 3. Add the store in Order Hub

1. Sign in → **Stores** → _Connect a Shopify store_.
2. Name, shop domain (`sitoweb1.myshopify.com`; a pasted URL like
   `https://sitoweb1.myshopify.com/admin` is normalized), currency, and the signing secret from
   step 2.3.
3. The new store becomes the current one. Use **Send test notification** in Shopify and check
   the store card: "Last webhook" updates and the log shows `webhook.processed`.

How webhooks are matched to stores: Shopify sends `X-Shopify-Shop-Domain`; Order Hub looks up
that store, decrypts **its** secret and verifies the HMAC. An unknown shop and a bad signature get
the same `401`, so the endpoint does not reveal which shops exist. After rotating the secret in
Shopify, paste the new one in _Update signing secret_ on the store card.

## 4. Test data in the real store

Two scripts fill a development store with realistic data through Shopify itself, so it reaches
Order Hub through the real webhooks (they use the [Shopify CLI](https://shopify.dev/docs/api/shopify-cli);
`npx` downloads it if it is not installed).

```bash
# once, in a normal terminal (opens the browser to approve the scopes)
npx @shopify/cli@5.0.1 store auth --store sitoweb1.myshopify.com \
  --scopes write_products,write_customers,write_orders,read_publications,write_publications

# products, customers and backdated orders (test transactions, some refunded/pending/cancelled)
npm run shopify:populate -- --store sitoweb1.myshopify.com --customers 25 --orders 40

# abandoned checkouts through the storefront (Playwright); password: Online Store → Preferences
SHOPIFY_STOREFRONT_PASSWORD='…' npm run shopify:abandon -- --store sitoweb1.myshopify.com --count 6
```

- The currency of the store in Order Hub must be the shop currency (the script prints it, e.g.
  `EUR`): amounts are formatted with the store currency.
- Everything is tagged `order-hub-demo`; products and customers are reused on re-runs.
- Customer emails use `@example.com` and receipts are not sent.
- Orders are created with `test: true` and test transactions: no real payment.
- Development stores accept **5 new orders per minute**: 40 orders take ~9 minutes.
- Orders are backdated with `processedAt`, which Order Hub uses as the order date, so every
  segment (new, returning, at risk) shows up.
- Limits: [`limitations.md`](limitations.md), items D5 and D6.

## Path B — app (how it would work in production for many merchants)

[`shopify.app.toml`](../../shopify.app.toml) already declares the topics, including the mandatory
privacy webhooks (`customers/redact`, `customers/data_request`, `shop/redact`). Only
`customers/redact` is processed today; see [`limitations.md`](limitations.md), items F1 and F4.

1. Create the app in the Dev Dashboard (or `shopify app init`, "build an app without a
   template") and copy the `client_id` into the TOML.
2. Replace the URLs in the TOML with your deployment.
3. In **API access → Protected customer data**, request access to name, email and phone; without
   it, webhooks arrive without the customer fields.
4. `shopify app deploy` publishes the configuration (scopes + webhook subscriptions).
5. Install the app on the store and add the store in Order Hub with the app's **Client secret**
   as signing secret (app webhooks are signed with it).

## Local testing without a store

```bash
npm run db:seed        # demo store + a local "order-hub-dev.myshopify.com" store (LOCAL_* vars)
npm run webhook:send   # signed orders/create for the local store
npm run webhook:send -- --topic checkouts/create --fixture tests/fixtures/checkouts-create.json
```

## Troubleshooting

| Symptom                           | Likely cause                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `401 invalid signature`           | store not added in Order Hub, domain different from `X-Shopify-Shop-Domain`, or wrong/rotated secret (update it on the card) |
| Every store returns 401           | `STORE_SECRETS_KEY` changed: secrets must be re-entered (limitation R7)                                                      |
| Order without customer name/email | missing _protected customer data_ access (Path B)                                                                            |
| `422 invalid payload`             | different API version with new/missing fields; check the `webhook.invalid_payload` log and adjust `lib/shopify/schemas.ts`   |
| No abandoned carts                | checkout webhooks not created, or the cart never reached the checkout contact step                                           |
| Shopify disabled the webhook      | the endpoint failed repeatedly (status ≠ 2xx); fix it and recreate the subscription                                          |
