-- Multi-store + abandoned checkouts.
-- Hand-written from `prisma migrate diff` so that existing rows survive:
--   1. create "stores" and a DEMO store that owns all pre-existing data
--   2. add "storeId" as NULLABLE, backfill it, then set NOT NULL
--   3. swap the global unique indexes for per-store ones
-- Prisma runs each migration in a transaction on PostgreSQL, so this is all-or-nothing.

-- 1. Stores ------------------------------------------------------------------
CREATE TYPE "StoreKind" AS ENUM ('DEMO', 'SHOPIFY');

CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "StoreKind" NOT NULL DEFAULT 'SHOPIFY',
    "shopDomain" TEXT,
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "webhookSecretEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stores_shopDomain_key" ON "stores"("shopDomain");

-- Fixed id: the app and the seed reference the demo store as "demo".
INSERT INTO "stores" ("id", "name", "kind", "currency", "updatedAt")
VALUES ('demo', 'Demo store', 'DEMO', 'BRL', CURRENT_TIMESTAMP);

-- 2. storeId: expand -> backfill -> contract --------------------------------
ALTER TABLE "customers" ADD COLUMN "storeId" TEXT;
ALTER TABLE "orders" ADD COLUMN "storeId" TEXT;
ALTER TABLE "webhook_events" ADD COLUMN "storeId" TEXT;
ALTER TABLE "agent_runs" ADD COLUMN "storeId" TEXT;

UPDATE "customers" SET "storeId" = 'demo' WHERE "storeId" IS NULL;
UPDATE "orders" SET "storeId" = 'demo' WHERE "storeId" IS NULL;
UPDATE "webhook_events" SET "storeId" = 'demo' WHERE "storeId" IS NULL;
UPDATE "agent_runs" SET "storeId" = 'demo' WHERE "storeId" IS NULL;

ALTER TABLE "customers" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "webhook_events" ALTER COLUMN "storeId" SET NOT NULL;

-- 3. Indexes: global -> per store -------------------------------------------
DROP INDEX "customers_lastOrderAt_idx";
DROP INDEX "customers_shopifyId_key";
DROP INDEX "customers_totalSpent_idx";
DROP INDEX "orders_placedAt_idx";
DROP INDEX "orders_shopifyId_key";
DROP INDEX "webhook_events_topic_receivedAt_idx";

CREATE UNIQUE INDEX "customers_storeId_shopifyId_key" ON "customers"("storeId", "shopifyId");
CREATE INDEX "customers_storeId_lastOrderAt_idx" ON "customers"("storeId", "lastOrderAt");
CREATE INDEX "customers_storeId_totalSpent_idx" ON "customers"("storeId", "totalSpent");
CREATE UNIQUE INDEX "orders_storeId_shopifyId_key" ON "orders"("storeId", "shopifyId");
CREATE INDEX "orders_storeId_placedAt_idx" ON "orders"("storeId", "placedAt");
CREATE INDEX "webhook_events_storeId_receivedAt_idx" ON "webhook_events"("storeId", "receivedAt");

-- 4. Checkouts ---------------------------------------------------------------
CREATE TABLE "checkouts" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shopifyId" TEXT NOT NULL,
    "customerId" TEXT,
    "email" TEXT,
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "itemsCount" INTEGER NOT NULL,
    "items" JSONB NOT NULL,
    "abandonedCheckoutUrl" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "shopifyUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkouts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "checkouts_storeId_shopifyId_key" ON "checkouts"("storeId", "shopifyId");
CREATE INDEX "checkouts_storeId_completedAt_startedAt_idx" ON "checkouts"("storeId", "completedAt", "startedAt");

-- 5. Foreign keys ------------------------------------------------------------
ALTER TABLE "customers" ADD CONSTRAINT "customers_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
