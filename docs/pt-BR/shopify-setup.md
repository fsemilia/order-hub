# Conectando uma loja Shopify

🌐 [English](../en/shopify-setup.md) · **Português** · [Italiano](../it/shopify-setup.md)

O Order Hub gerencia **várias lojas**. Cada loja tem seus próprios clientes, pedidos e carrinhos
abandonados, e seu próprio segredo de assinatura de webhooks, salvo criptografado (AES-256-GCM,
`STORE_SECRETS_KEY`). A loja demo (dados de exemplo do seed) sempre existe; as lojas reais são
adicionadas na página **Lojas**. O seletor no cabeçalho e a opção "Dados demo / Loja real" no
login escolhem qual loja você está vendo.

> As telas da Shopify mudam com frequência. Se algo abaixo não bater, use o servidor MCP
> `shopify-dev-mcp` (configurado em `.mcp.json`) ou https://shopify.dev/docs para conferir.

## 0. Loja de desenvolvimento

1. No [Shopify Partners](https://partners.shopify.com) → **Stores** → **Add store** →
   _Development store_ (grátis, sem cobrança).
2. Em **Configurações → Pagamentos**, ative o _Bogus Gateway_ (pagamentos de teste) se quiser
   fazer pedidos à mão.

## 1. URL pública

Webhooks exigem HTTPS público:

- **Produção/preview:** o deploy na Vercel (ver [`deploy.md`](deploy.md)), ex.:
  `https://order-hub-lime.vercel.app/api/webhooks/shopify`
- **Local:** um túnel, ex.: `npx cloudflared tunnel --url http://localhost:3000` (ou ngrok).

A página **Lojas** mostra a URL exata do webhook do deploy que você está usando.

## 2. Webhooks (Caminho A — webhooks da loja, mais rápido)

1. Admin da loja → **Configurações → Notificações → Webhooks** → **Criar webhook**.
2. Formato **JSON**, a URL do passo 1, última versão da API. Crie um webhook por evento:
   `Criação de pedido`, `Atualização de pedido`, `Pagamento de pedido`, `Cancelamento de pedido`,
   `Criação de cliente`, `Atualização de cliente`, `Criação de checkout`, `Atualização de checkout`
   (tópicos `orders/create`, `orders/updated`, `orders/paid`, `orders/cancelled`,
   `customers/create`, `customers/update`, `checkouts/create`, `checkouts/update`).
3. No fim da página a Shopify mostra a chave que assina esses webhooks ("Seus webhooks serão
   assinados com…"). **Trate-a como uma senha**: não cole em chats nem em commits. Se ela foi
   exposta, rotacione-a na mesma página.

## 3. Adicionar a loja no Order Hub

1. Entre → **Lojas** → _Conectar uma loja Shopify_.
2. Nome, domínio da loja (`sitoweb1.myshopify.com`; uma URL colada como
   `https://sitoweb1.myshopify.com/admin` é normalizada), moeda e o segredo do passo 2.3.
3. A nova loja vira a loja atual. Use **Enviar notificação de teste** na Shopify e confira o
   cartão da loja: "Último webhook" é atualizado e o log mostra `webhook.processed`.

Como os webhooks são associados às lojas: a Shopify envia `X-Shopify-Shop-Domain`; o Order Hub
procura essa loja, decifra o segredo **dela** e verifica o HMAC. Loja desconhecida e assinatura
inválida recebem o mesmo `401`, então o endpoint não revela quais lojas existem. Depois de
rotacionar o segredo na Shopify, cole o novo em _Atualizar segredo de assinatura_ no cartão da loja.

## 4. Dados de teste na loja real

Dois scripts preenchem uma loja de desenvolvimento com dados realistas pela própria Shopify, que
chegam ao Order Hub pelos webhooks reais (usam a [Shopify CLI](https://shopify.dev/docs/api/shopify-cli);
o `npx` a baixa se não estiver instalada).

```bash
# uma vez, em um terminal normal (abre o navegador para aprovar os escopos)
npx @shopify/cli@5.0.1 store auth --store sitoweb1.myshopify.com \
  --scopes write_products,write_customers,write_orders,read_publications,write_publications

# produtos, clientes e pedidos retroativos (transações de teste, alguns reembolsados/pendentes/cancelados)
npm run shopify:populate -- --store sitoweb1.myshopify.com --customers 25 --orders 40

# checkouts abandonados pela vitrine (Playwright); senha: Loja virtual → Preferências
SHOPIFY_STOREFRONT_PASSWORD='…' npm run shopify:abandon -- --store sitoweb1.myshopify.com --count 6
```

- Tudo recebe a tag `order-hub-demo`; produtos e clientes são reaproveitados ao rodar de novo.
- Os e-mails dos clientes usam `@example.com` e nenhum recibo é enviado.
- Os pedidos são criados com `test: true` e transações de teste: nenhum pagamento real.
- Lojas de desenvolvimento aceitam **5 pedidos novos por minuto**: 40 pedidos levam ~9 minutos.
- Os pedidos são retroativos via `processedAt`, que o Order Hub usa como data do pedido, para que
  todos os segmentos (novo, recorrente, em risco) apareçam.
- Limites: [`limitations.md`](limitations.md), itens D5 e D6.

## Caminho B — app (como funcionaria em produção para muitos lojistas)

O [`shopify.app.toml`](../../shopify.app.toml) já declara os tópicos, incluindo os webhooks de
privacidade obrigatórios (`customers/redact`, `customers/data_request`, `shop/redact`). Hoje só
`customers/redact` é processado; ver [`limitations.md`](limitations.md), itens F1 e F4.

1. Crie o app no Dev Dashboard (ou `shopify app init`, "build an app without a template") e copie
   o `client_id` para o TOML.
2. Troque as URLs do TOML pelas do seu deploy.
3. Em **API access → Protected customer data**, peça acesso a nome, e-mail e telefone; sem isso
   os webhooks chegam sem os campos do cliente.
4. `shopify app deploy` publica a configuração (escopos + assinaturas de webhooks).
5. Instale o app na loja e adicione a loja no Order Hub com o **Client secret** do app como
   segredo de assinatura (os webhooks do app são assinados com ele).

## Testes locais sem loja

```bash
npm run db:seed        # loja demo + uma loja local "order-hub-dev.myshopify.com" (variáveis LOCAL_*)
npm run webhook:send   # orders/create assinado para a loja local
npm run webhook:send -- --topic checkouts/create --fixture tests/fixtures/checkouts-create.json
```

## Solução de problemas

| Sintoma                       | Causa provável                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `401 invalid signature`       | loja não adicionada no Order Hub, domínio diferente de `X-Shopify-Shop-Domain` ou segredo errado/rotacionado (atualize-o) |
| Todas as lojas retornam 401   | a `STORE_SECRETS_KEY` mudou: os segredos precisam ser informados de novo (limitação R7)                                   |
| Pedido sem nome/e-mail        | falta o acesso a _protected customer data_ (Caminho B)                                                                    |
| `422 invalid payload`         | versão de API diferente com campos novos/ausentes; veja o log `webhook.invalid_payload` e ajuste `lib/shopify/schemas.ts` |
| Nenhum carrinho abandonado    | webhooks de checkout não criados, ou o carrinho nunca chegou à etapa de contato do checkout                               |
| A Shopify desativou o webhook | o endpoint falhou repetidamente (status ≠ 2xx); corrija e recrie a assinatura                                             |
