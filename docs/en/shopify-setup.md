# Connecting a Shopify development store

🌐 **English** · [Português](../pt-BR/shopify-setup.md) · [Italiano](../it/shopify-setup.md)

Order Hub only needs to **receive webhooks**. There are two paths; for the demo, start with A.

> Shopify's screens change often. If something below does not match, use the
> `shopify-dev-mcp` MCP server (configured in `.mcp.json`) or https://shopify.dev/docs to check.

## 0. Development store

1. In [Shopify Partners](https://partners.shopify.com) → **Stores** → **Add store** →
   _Development store_ (free, no billing).
2. In the store, create a few products (or use **Generate test data**, if available).
3. In **Settings → Payments**, enable the _Bogus Gateway_ (test payments) to place orders.

## 1. Public URL

Webhooks need public HTTPS:

- **Production/preview:** the Vercel deployment (see [`deploy.md`](deploy.md)), e.g.
  `https://order-hub.vercel.app/api/webhooks/shopify`
- **Local:** a tunnel, e.g. `npx cloudflared tunnel --url http://localhost:3000` (or ngrok).

## Path A — store webhooks (fastest)

1. Store admin → **Settings → Notifications → Webhooks** → **Create webhook**.
2. Event `Order creation`, format **JSON**, the URL from step 1, latest API version.
3. Repeat for `Order update`, `Order payment`, `Order cancellation`, `Customer creation`,
   `Customer update`.
4. The page shows the key used to sign the webhooks ("Your webhooks will be signed with…").
   Copy it into `SHOPIFY_WEBHOOK_SECRET`.
5. Use **Send test notification** and check the log (`webhook.processed`) and the _Clientes_ page.

## Path B — app (how it would work in production for many merchants)

[`shopify.app.toml`](../../shopify.app.toml) already declares the topics, including the mandatory
privacy webhooks (`customers/redact`, `customers/data_request`, `shop/redact`). Only
`customers/redact` is processed today; see [`limitations.md`](limitations.md), item F4.

1. Create the app in the Dev Dashboard (or `npm i -g @shopify/cli && shopify app init` and choose
   "build an app without a template"), and copy the `client_id` into the TOML.
2. Replace `order-hub.vercel.app` in the TOML with your URL.
3. In **API access → Protected customer data**, request access to name, email and phone; without
   it, webhooks arrive without the customer fields.
4. `shopify app deploy` publishes the configuration (scopes + webhook subscriptions).
5. Install the app on the development store.
6. `SHOPIFY_WEBHOOK_SECRET` = the app's **Client secret** (Shopify signs webhooks with it).
7. Optional: `SHOPIFY_SHOP_DOMAIN=your-store.myshopify.com` to reject other shops.

## Testing

1. Place an order in the store (Bogus Gateway: card number `1`).
2. See the order under _Clientes_; the dashboard shows "último webhook" (last webhook).
3. Partially refund the order in the admin → `orders/updated` → the customer's LTV goes down.
4. Without a store, simulate everything locally: `npm run webhook:send` (see README).

## Troubleshooting

| Symptom                           | Likely cause                                                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `401 invalid signature`           | wrong secret (Path A: key from the webhooks page; B: client secret) or a proxy changed the body                            |
| Order without customer name/email | missing _protected customer data_ access (Path B)                                                                          |
| `422 invalid payload`             | different API version with new/missing fields; check the `webhook.invalid_payload` log and adjust `lib/shopify/schemas.ts` |
| Shopify disabled the webhook      | the endpoint failed repeatedly (status ≠ 2xx); fix it and recreate the subscription                                        |
