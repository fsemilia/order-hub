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

   | Variable                                                     | Value                               |
   | ------------------------------------------------------------ | ----------------------------------- |
   | `DATABASE_URL`                                               | transaction pooler (6543)           |
   | `DIRECT_URL`                                                 | session pooler / direct (5432)      |
   | `BETTER_AUTH_SECRET`                                         | `openssl rand -base64 32`           |
   | `BETTER_AUTH_URL`                                            | `https://<your-project>.vercel.app` |
   | `SHOPIFY_WEBHOOK_SECRET`                                     | see `shopify-setup.md`              |
   | `ANTHROPIC_API_KEY`                                          | optional (enables the agent)        |
   | `ALLOWED_EMAILS`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | optional                            |
   | `DEMO_EMAIL`, `DEMO_PASSWORD`                                | demo user created by the seed       |

3. Deploy. The `buildCommand` is `npm run vercel-build` = `prisma migrate deploy && next build`:
   migrations are applied before the build; if they fail, the deploy fails and the previous
   version stays online.

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

## Rollback

- App: **Vercel → Deployments → Promote** a previous version (instant).
- Database: migrations are additive (expand/contract, see skill `prisma-migration`), so the
  previous app version stays compatible with the new schema.
