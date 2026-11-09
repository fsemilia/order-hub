# Conectando uma loja Shopify de desenvolvimento

🌐 [English](../en/shopify-setup.md) · **Português** · [Italiano](../it/shopify-setup.md)

O Order Hub só precisa **receber webhooks**. Há dois caminhos; para a demo, comece pelo A.

> As telas da Shopify mudam com frequência. Se algo abaixo não bater, use o servidor MCP
> `shopify-dev-mcp` (configurado em `.mcp.json`) ou https://shopify.dev/docs para conferir.

## 0. Loja de desenvolvimento

1. No [Shopify Partners](https://partners.shopify.com) → **Stores** → **Add store** →
   _Development store_ (gratuita, sem cobrança).
2. Na loja, crie alguns produtos (ou use **Generate test data**, se disponível).
3. Em **Settings → Payments**, ative o _Bogus Gateway_ (pagamentos de teste) para fechar pedidos.

## 1. URL pública

Os webhooks precisam de HTTPS público:

- **Produção/preview:** o deploy da Vercel (ver [`deploy.md`](deploy.md)), ex.
  `https://order-hub.vercel.app/api/webhooks/shopify`
- **Local:** um túnel, ex. `npx cloudflared tunnel --url http://localhost:3000` (ou ngrok).

## Caminho A — webhooks da própria loja (mais rápido)

1. Admin da loja → **Settings → Notifications → Webhooks** → **Create webhook**.
2. Evento `Order creation`, formato **JSON**, URL do passo 1, versão da API mais recente.
3. Repita para `Order update`, `Order payment`, `Order cancellation`, `Customer creation`,
   `Customer update`.
4. A página mostra a chave usada para assinar os webhooks ("Your webhooks will be signed with…").
   Copie para `SHOPIFY_WEBHOOK_SECRET`.
5. Use **Send test notification** e confira o log (`webhook.processed`) e a página _Clientes_.

## Caminho B — app (como seria em produção para vários lojistas)

O arquivo [`shopify.app.toml`](../../shopify.app.toml) já declara os tópicos, incluindo os
webhooks obrigatórios de privacidade (`customers/redact`, `customers/data_request`, `shop/redact`). Hoje só
`customers/redact` é processado; ver [`limitations.md`](limitations.md), item F4.

1. Crie o app no Dev Dashboard (ou `npm i -g @shopify/cli && shopify app init` e escolha "build
   an app without a template"), e copie o `client_id` para o TOML.
2. Troque `order-hub.vercel.app` no TOML pela sua URL.
3. Em **API access → Protected customer data**, solicite acesso a nome, e-mail e telefone; sem
   isso os webhooks chegam sem os campos do cliente.
4. `shopify app deploy` publica a configuração (escopos + inscrições de webhook).
5. Instale o app na loja de desenvolvimento.
6. `SHOPIFY_WEBHOOK_SECRET` = **Client secret** do app (a Shopify assina os webhooks com ele).
7. Opcional: `SHOPIFY_SHOP_DOMAIN=sua-loja.myshopify.com` para rejeitar outras lojas.

## Testando

1. Faça um pedido na loja (Bogus Gateway: cartão `1`).
2. Veja o pedido em _Clientes_; o painel mostra "último webhook".
3. Reembolse parte do pedido no admin → `orders/updated` → o LTV do cliente diminui.
4. Sem loja, simule tudo localmente: `npm run webhook:send` (ver README).

## Problemas comuns

| Sintoma                           | Causa provável                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `401 invalid signature`           | segredo errado (Caminho A: chave da página de webhooks; B: client secret) ou algum proxy alterou o corpo                |
| Pedido sem nome/e-mail do cliente | falta acesso a _protected customer data_ (Caminho B)                                                                    |
| `422 invalid payload`             | versão da API diferente com campos novos/ausentes; ver log `webhook.invalid_payload` e ajustar `lib/shopify/schemas.ts` |
| Shopify desativou o webhook       | o endpoint falhou repetidamente (status ≠ 2xx); corrija e recrie                                                        |
