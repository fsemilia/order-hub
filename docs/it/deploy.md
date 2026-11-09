# Deploy: Supabase + Vercel

🌐 [English](../en/deploy.md) · [Português](../pt-BR/deploy.md) · **Italiano**

## 1. Database (Supabase)

1. Crea un progetto su https://supabase.com, regione **South America (São Paulo)** — la stessa
   delle funzioni Vercel (`gru1`, in `vercel.json`), per avere la latenza minima tra app e
   database.
2. **Project Settings → Database → Connection string**:
   - `DATABASE_URL` = **Transaction pooler** (porta `6543`). Usato dall'app: le funzioni serverless
     aprono e chiudono connessioni di continuo, il pooler assorbe questo carico.
   - `DIRECT_URL` = **Session pooler** o connessione diretta (porta `5432`). Usato solo dalle
     migrazioni.

## 2. App (Vercel)

1. https://vercel.com/new → importa il repository GitHub.
2. **Environment Variables** (Production e Preview):

   | Variabile                                                    | Valore                              |
   | ------------------------------------------------------------ | ----------------------------------- |
   | `DATABASE_URL`                                               | transaction pooler (6543)           |
   | `DIRECT_URL`                                                 | session pooler / diretta (5432)     |
   | `BETTER_AUTH_SECRET`                                         | `openssl rand -base64 32`           |
   | `BETTER_AUTH_URL`                                            | `https://<tuo-progetto>.vercel.app` |
   | `SHOPIFY_WEBHOOK_SECRET`                                     | vedi `shopify-setup.md`             |
   | `ANTHROPIC_API_KEY`                                          | opzionale (abilita l'agente)        |
   | `ALLOWED_EMAILS`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | opzionali                           |
   | `DEMO_EMAIL`, `DEMO_PASSWORD`                                | utente demo creato dal seed         |

3. Deploy. Il `buildCommand` è `npm run vercel-build` = `prisma migrate deploy && next build`: le
   migrazioni vengono applicate prima della build; se falliscono, il deploy fallisce e la versione
   precedente resta online.

## 3. Dati demo (opzionale)

Per un ambiente demo, lancia il seed dal tuo computer puntando a Supabase (lo script si rifiuta di
girare con `NODE_ENV=production` / `VERCEL_ENV=production`):

```bash
DATABASE_URL="<DIRECT_URL di Supabase>" DATABASE_POOL_MAX=5 npm run db:seed
```

## 4. Dopo il deploy

- `GET /api/health` → `{"status":"ok","db":"up"}`
- Punta il webhook Shopify a `https://<progetto>.vercel.app/api/webhooks/shopify`
- Ogni Pull Request ha un **Preview Deployment**. Per tenere le preview lontane dai dati di
  produzione, usa un branch di Supabase o un database di staging nelle variabili _Preview_ (vedi
  [`limitations.md`](limitations.md), voce A4).

## Rollback

- App: **Vercel → Deployments → Promote** di una versione precedente (istantaneo).
- Database: le migrazioni sono additive (expand/contract, vedi skill `prisma-migration`), quindi la
  versione precedente dell'app resta compatibile con il nuovo schema.
