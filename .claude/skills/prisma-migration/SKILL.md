---
name: prisma-migration
description: Safely change the Order Hub database schema (prisma/schema.prisma) and create a Prisma migration. Use for any new model, field, index or relation, renames, and data backfills.
---

# Schema change workflow (Prisma 7)

Prisma 7 specifics in this repo: generator `prisma-client` outputs to `generated/prisma`
(import from `@/generated/prisma/client`), the datasource URL lives in `prisma.config.ts`
(`DIRECT_URL` for migrations, falls back to `DATABASE_URL`), and the client uses the
`@prisma/adapter-pg` driver adapter (`lib/db.ts`). For API details see the `prisma-client-api`
and `prisma-cli` skills.

## Rules

- **Money** is `Decimal @db.Decimal(12, 2)`. Never `Float`.
- **Shopify IDs** are `String @unique`.
- **Time-dependent values** (e.g. the customer segment) are derived at query time, not stored.
- **Migrations are append-only**: never edit a migration that is already on `main`.
- **Expand / contract** for anything destructive: add the new column → backfill → switch code →
  drop the old column in a *later* PR. A rename is never a single migration in production.
- New `NOT NULL` columns on existing tables need a `@default` or a backfill step.
- Add an `@@index` for every new filter/sort column used by `lib/crm/queries.ts`.

## Steps

1. Edit `prisma/schema.prisma` (keep the header conventions comment accurate).
2. `npm run db:migrate -- --name <snake_case_description>` (runs `migrate dev` + `generate`).
3. Read the generated SQL in `prisma/migrations/*/migration.sql`. Look for `DROP`, table rewrites,
   and missing defaults. If it is destructive, stop and split it (expand/contract).
4. Update `prisma/seed.ts` if the new data should appear in the demo.
5. `npm run typecheck && npm run test:integration` (the test DB is migrated by Vitest global setup).
6. Production: `vercel-build` runs `prisma migrate deploy` before `next build`.
