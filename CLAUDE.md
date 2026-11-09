# Order Hub — guide for Claude Code

@AGENTS.md

Shopify → CRM for Brazilian e-commerce: receives Shopify order webhooks, stores them in Postgres
with Prisma, computes customer metrics (LTV, average ticket, segment novo/recorrente/em_risco)
and offers a read-only AI retention agent. UI and user-facing copy are in **pt-BR**; code,
comments, commits and identifiers are in **English**.

## Stack

Next.js 16 (App Router, `cacheComponents`, `proxy.ts`) · React 19 · TypeScript strict ·
Tailwind 4 · Prisma 7 (`prisma-client` generator → `generated/prisma`, `@prisma/adapter-pg`,
config in `prisma.config.ts`) · PostgreSQL (Supabase in prod, `prisma dev` locally) ·
Better Auth (email/password + optional GitHub, no public sign-up) · Zod 4 · Anthropic SDK
(tool runner) · Vitest 5 · Playwright · Vercel (region `gru1`).

## Commands

```bash
npm run db:dev            # local Postgres (prisma dev, no Docker)   → DATABASE_URL in .env
npm run db:test:start     # second local Postgres for integration tests → DATABASE_URL_TEST
npm run db:migrate -- --name <name>   # new migration + prisma generate
npm run db:seed           # demo data (160 customers) + demo user
npm run dev               # http://localhost:3000
npm run check             # lint + typecheck + unit tests   ← run before every commit
npm run test:integration  # webhook pipeline + queries against a real DB
npm run test:e2e          # Playwright (reuses a running dev server)
npm run webhook:send      # send a signed Shopify webhook to localhost
```

## Map

- `app/api/webhooks/shopify/route.ts` → thin; logic in `lib/shopify/webhooks.ts`
- `lib/shopify/` — `hmac.ts`, `schemas.ts` (Zod), `ingest.ts` (idempotent upserts), `webhooks.ts` (pipeline)
- `lib/crm/` — `segments.ts` (pure rules), `aggregates.ts` (recompute in tx), `queries.ts` (read models)
- `lib/agent/` — `tools.ts`, `prompt.ts`, `run.ts`
- `lib/session.ts` — Data Access Layer: `requireUser()`; `proxy.ts` is only an optimistic cookie check
- `app/(app)/` — authenticated pages; `app/login/`
- `docs/` — architecture, ADRs, Shopify setup, deploy, agent

## Invariants (do not break)

1. **Money**: `Decimal(12,2)` in the DB, integer cents in JS (`lib/money.ts`). Never float math.
2. **Webhooks**: HMAC over the raw body; event log + writes in one transaction; upserts only;
   stale-update guard on `updated_at`; status codes as documented in `lib/shopify/webhooks.ts`.
3. **Aggregates** are recomputed from orders inside the same transaction (never incremented).
4. **Segments** depend on "now": derived at query time (`segmentOf` / `segmentWhere`), never stored.
5. **Authorization** happens in `requireUser()` next to the data, in every page/action/route
   that touches customer data. Server Actions validate input with Zod.
6. **LGPD**: the agent only sees first name + internal id. Redacted customers never regain PII.
7. **Cache Components**: request-time data (session, `searchParams`, `params`, `usePathname`)
   lives inside `<Suspense>`; the static shell must prerender (`npm run build` enforces it).
8. Files importing `server-only` cannot run in plain Node: scripts use `tsx --conditions=react-server`,
   Vitest aliases `server-only` to a stub.

## Working agreements

- Use the project skills: `shopify-webhook-topic`, `prisma-migration`, `agent-tool`,
  `ship-feature`, `br-ecommerce-integrations` (+ Prisma's `prisma-client-api`, `prisma-cli`).
- Before using an API you are unsure of (Next 16, Prisma 7, Better Auth 1.7, Shopify), read the
  local docs (`node_modules/next/dist/docs/`, the Prisma skills) or the Shopify Dev MCP. Do not guess.
- Every behavior change ships with a test. Prefer integration tests against the real DB over mocks.
- Run the `code-reviewer` subagent on changes to webhooks, auth, money, schema or the agent.
- Never edit `.env`, applied migrations or `generated/` (hooks block it).
- Conventional Commits; small PRs; see `.github/pull_request_template.md`.
