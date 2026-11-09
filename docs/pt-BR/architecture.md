# Arquitetura

🌐 [English](../en/architecture.md) · **Português** · [Italiano](../it/architecture.md)

## Visão geral

Um único app Next.js (monólito modular) implantado na Vercel, com PostgreSQL gerenciado
(Supabase, região São Paulo). Não há backend separado: Route Handlers recebem webhooks,
Server Components leem o banco diretamente e Server Actions executam mutações e o agente.

```text
             ┌─────────────── Vercel (gru1) ───────────────┐
Shopify ───▶ │ /api/webhooks/shopify  → lib/shopify/*      │
             │ /api/auth/*            → Better Auth        │ ───▶ Supabase Postgres
Equipe ────▶ │ proxy.ts → app/(app)/* → lib/crm/queries    │      (pooler 6543)
             │ Server Action → lib/agent → Anthropic API   │
             └─────────────────────────────────────────────┘
```

## Fluxo de um webhook

1. `route.ts` lê o **corpo bruto** (`req.text()`) — o HMAC é calculado sobre os bytes exatos.
2. `verifyShopifyHmac` compara em tempo constante com o segredo do app.
3. Cabeçalhos obrigatórios (`X-Shopify-Webhook-Id`, `X-Shopify-Topic`) e, opcionalmente, a loja
   permitida (`SHOPIFY_SHOP_DOMAIN`).
4. **Uma transação**:
   - insere `webhook_events(id)` — se o id já existe, `P2002` → `200 {duplicate: true}`;
   - valida o payload com Zod (inválido → `422` e rollback, nada é gravado);
   - executa o handler do tópico (upsert de pedido, itens, cliente);
   - recalcula os agregados do cliente a partir dos pedidos.
5. Qualquer outro erro sobe como `500` e a Shopify reenvia com backoff.

### Garantias

| Problema real                             | Tratamento                                                        |
| ----------------------------------------- | ----------------------------------------------------------------- |
| Entrega duplicada (at-least-once)         | log de eventos com PK = webhook id                                |
| Mesmo pedido reenviado com outro id       | `upsert` por `shopifyId`                                          |
| `orders/updated` antes de `orders/create` | `upsert` + guarda de `updated_at` (eventos antigos são ignorados) |
| Reembolso / edição do pedido              | `current_total_price` + recálculo completo dos agregados          |
| Falha no meio do processamento            | transação: ou tudo, ou nada                                       |
| Pedido sem cliente (checkout convidado)   | pedido gravado com `customerId = null`                            |
| Pedido de exclusão (LGPD)                 | `customers/redact` anonimiza e impede reidratação de PII          |

Os limites dessas garantias (ex.: entregas concorrentes do mesmo pedido, processamento síncrono)
estão em [`limitations.md`](limitations.md), itens R1–R2.

## Modelo de dados

- `customers` — dados do cliente + agregados desnormalizados (`ordersCount`, `totalSpent`,
  `firstOrderAt`, `lastOrderAt`) com índices em `lastOrderAt` e `totalSpent`.
- `orders`, `order_line_items` — pedidos e itens; `totalPrice` em `Decimal(12,2)`.
- `webhook_events` — log de idempotência.
- `agent_runs` — auditoria do agente (pergunta, resposta, ferramentas, tokens, latência).
- `user`, `session`, `account`, `verification` — Better Auth.

O **segmento** não é armazenado porque depende da data atual. A regra está em
`lib/crm/segments.ts` em duas formas equivalentes e testadas: `segmentOf` (JS) e `segmentWhere`
(filtro Prisma, para que o banco filtre e pagine).

## Autenticação e autorização

- `proxy.ts`: checagem otimista do cookie de sessão (sem acesso ao banco) e redirect para `/login`.
- `lib/session.ts` (Data Access Layer): `requireUser()` valida a sessão no banco. É chamado em
  toda página, Server Action e rota que acessa dados de clientes. Um cookie forjado passa pelo
  proxy, mas não pela DAL.
- Sem cadastro público. GitHub OAuth só admite e-mails em `ALLOWED_EMAILS`.

## Renderização (Cache Components)

O shell das páginas (navegação, títulos) é pré-renderizado estaticamente. Tudo que depende da
requisição (sessão, `searchParams`, `params`, `usePathname`) fica dentro de `<Suspense>` e é
transmitido por streaming. O `next build` falha se essa regra for quebrada.

## Observabilidade

- Logs estruturados em JSON (`lib/logger.ts`) com o id do webhook, tópico e resultado.
- `/api/health` verifica o banco (para monitor de uptime).
- `agent_runs` registra custo (tokens) e latência de cada execução do agente.
