# Deploy: Supabase + Vercel

🌐 [English](../en/deploy.md) · **Português** · [Italiano](../it/deploy.md)

## 1. Banco (Supabase)

1. Crie um projeto em https://supabase.com, região **South America (São Paulo)** — a mesma da
   função na Vercel (`gru1`, em `vercel.json`), para latência mínima entre app e banco.
2. **Project Settings → Database → Connection string**:
   - `DATABASE_URL` = **Transaction pooler** (porta `6543`). Usado pela aplicação: funções
     serverless abrem e fecham conexões o tempo todo, o pooler absorve isso.
   - `DIRECT_URL` = **Session pooler** ou conexão direta (porta `5432`). Usado só pelas migrações.

## 2. App (Vercel)

1. https://vercel.com/new → importe o repositório do GitHub.
2. **Environment Variables** (Production e Preview):

   | Variável                                                     | Valor                              |
   | ------------------------------------------------------------ | ---------------------------------- |
   | `DATABASE_URL`                                               | transaction pooler (6543)          |
   | `DIRECT_URL`                                                 | session pooler / direta (5432)     |
   | `BETTER_AUTH_SECRET`                                         | `openssl rand -base64 32`          |
   | `BETTER_AUTH_URL`                                            | `https://<seu-projeto>.vercel.app` |
   | `SHOPIFY_WEBHOOK_SECRET`                                     | ver `shopify-setup.md`             |
   | `ANTHROPIC_API_KEY`                                          | opcional (habilita o agente)       |
   | `ALLOWED_EMAILS`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | opcionais                          |
   | `DEMO_EMAIL`, `DEMO_PASSWORD`                                | usuário demo criado pelo seed      |

3. Deploy. O `buildCommand` é `npm run vercel-build` = `prisma migrate deploy && next build`:
   as migrações são aplicadas antes do build; se falharem, o deploy falha e a versão anterior
   continua no ar.

## TLS com a Supabase

Os certificados da Supabase são assinados por uma raiz privada (Supabase Root 2021 CA) que não está
no trust store do Node, e o `pg` trata `sslmode=require` como verificação completa contra as CAs do
sistema, então a conexão falha com `SELF_SIGNED_CERT_IN_CHAIN`. A solução aqui **não** é desativar a
verificação: `lib/db-adapter.ts` fixa a CA raiz oficial da Supabase para hosts `*.supabase.com` e
mantém a verificação completa (cadeia + hostname). Mantenha `?sslmode=require` nas URLs (as
migrações do Prisma usam); o app remove o parâmetro antes de conectar. Ver
[`limitations.md`](limitations.md), item R6.

## 3. Dados de demonstração (opcional)

Para um ambiente de demo, rode o seed da sua máquina apontando para o Supabase
(o script se recusa a rodar com `NODE_ENV=production`/`VERCEL_ENV=production`):

```bash
DATABASE_URL="<DIRECT_URL do Supabase>" DATABASE_POOL_MAX=5 npm run db:seed
```

## 4. Depois do deploy

- `GET /api/health` → `{"status":"ok","db":"up"}`
- Configure o webhook da Shopify para `https://<projeto>.vercel.app/api/webhooks/shopify`
- Cada Pull Request ganha um **Preview Deployment**. Para previews isoladas do banco de produção,
  use um branch do Supabase ou um banco de staging nas variáveis de _Preview_ (ver
  [`limitations.md`](limitations.md), item A4).

## Rollback

- App: **Vercel → Deployments → Promote** uma versão anterior (instantâneo).
- Banco: migrações são aditivas (expand/contract, ver skill `prisma-migration`), então a versão
  anterior do app continua compatível com o schema novo.
