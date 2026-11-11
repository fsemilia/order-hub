# Deploy: Supabase + Vercel

🌐 **English** · [Português](../pt-BR/deploy.md) · [Italiano](../it/deploy.md)

## 1. Database (Supabase)

1. Create a project at https://supabase.com, region **South America (São Paulo)** — the same as
   the Vercel function region (`gru1`, in `vercel.json`), for minimum latency between app and
   database.
2. **Project Settings → Database → Connection string**:
   - `DATABASE_URL` = **Transaction pooler** (port `6543`). Used by the app: serverless functions
     open and close connections all the time, the pooler absorbs that.
   - `DIRECT_URL` = **Session pooler** or direct connection (port `5432`). Used only by migrations.

## 2. App (Vercel)

1. https://vercel.com/new → import the GitHub repository.
2. **Environment Variables** (Production and Preview):

   | Variable                                                     | Value                                                                                       |
   | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
   | `DATABASE_URL`                                               | transaction pooler (6543)                                                                   |
   | `DIRECT_URL`                                                 | session pooler / direct (5432)                                                              |
   | `BETTER_AUTH_SECRET`                                         | `openssl rand -base64 32`                                                                   |
   | `BETTER_AUTH_URL`                                            | `https://<your-project>.vercel.app`                                                         |
   | `STORE_SECRETS_KEY`                                          | `openssl rand -base64 32` (encrypts store webhook secrets)                                  |
   | `ANTHROPIC_API_KEY`                                          | optional: operator key, used only by `AGENT_OWNER_EMAILS` (other users bring their own key) |
   | `AGENT_OWNER_EMAILS`                                         | optional, comma-separated emails allowed to use `ANTHROPIC_API_KEY`                         |
   | `ALLOWED_EMAILS`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | optional                                                                                    |
   | `DEMO_EMAIL`, `DEMO_PASSWORD`                                | demo user created by the seed                                                               |

3. Deploy. The `buildCommand` is `npm run vercel-build` = `prisma migrate deploy && next build`:
   migrations are applied before the build; if they fail, the deploy fails and the previous
   version stays online.

## TLS to Supabase

Supabase's certificates chain to a private root (Supabase Root 2021 CA) that is not in Node's
trust store, and `pg` treats `sslmode=require` as full verification against the system CAs, so the
connection fails with `SELF_SIGNED_CERT_IN_CHAIN`. The fix here is **not** to disable
verification: `lib/db-adapter.ts` pins the official Supabase root CA for `*.supabase.com` hosts and
keeps full verification (chain + hostname). Keep `?sslmode=require` in the URLs (Prisma migrations
use it); the app removes it before connecting. See [`limitations.md`](limitations.md), item R6.

## 3. Demo data (optional)

For a demo environment, run the seed from your machine against Supabase (the script refuses to
run with `NODE_ENV=production` / `VERCEL_ENV=production`):

```bash
DATABASE_URL="<Supabase DIRECT_URL>" DATABASE_POOL_MAX=5 npm run db:seed
```

## 4. After deploying

- `GET /api/health` → `{"status":"ok","db":"up"}`
- Point the Shopify webhook to `https://<project>.vercel.app/api/webhooks/shopify`
- Every Pull Request gets a **Preview Deployment**. To keep previews away from production data,
  use a Supabase branch or a staging database in the _Preview_ variables (see
  [`limitations.md`](limitations.md), item A4).

## Upgrading an existing deployment to multi-store

Migration `20261110000000_multi_store` moves **every existing row** into the demo store (`demo`).
That is right when the database only holds seed data. If it already holds orders from a real
shop, re-home them before going live (one `UPDATE … SET "storeId" = '<new store id>'` per table,
after connecting the store), otherwise they show up as demo data.

Order: (1) add `STORE_SECRETS_KEY` to the Vercel environment, (2) deploy (the migration runs in
the build), (3) connect the store on the Stores page with its signing secret right away: until
then its webhooks get `401` and Shopify retries them. Remove the obsolete `SHOPIFY_WEBHOOK_SECRET`
and `SHOPIFY_SHOP_DOMAIN` variables.

## Rollback

- App: **Vercel → Deployments → Promote** a previous version (instant).
- Database: migrations are additive (expand/contract, see skill `prisma-migration`), so the
  previous app version stays compatible with the new schema.
