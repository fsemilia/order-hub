import "server-only";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { DEMO_STORE_ID } from "./domain";

export { DEMO_STORE_ID };

export type StoreSummary = {
  id: string;
  name: string;
  kind: "DEMO" | "SHOPIFY";
  shopDomain: string | null;
  currency: string;
};

const summary = { id: true, name: true, kind: true, shopDomain: true, currency: true } as const;

export function listStores(): Promise<StoreSummary[]> {
  return prisma.store.findMany({ select: summary, orderBy: [{ kind: "asc" }, { name: "asc" }] });
}

export function getStore(id: string): Promise<StoreSummary | null> {
  return prisma.store.findUnique({ where: { id }, select: summary });
}

/** Store + decrypted webhook secret, for the webhook pipeline only. */
export async function getWebhookTarget(shopDomain: string) {
  const store = await prisma.store.findUnique({
    where: { shopDomain },
    select: { id: true, kind: true, webhookSecretEnc: true },
  });
  if (!store || store.kind !== "SHOPIFY" || !store.webhookSecretEnc) return null;
  return {
    storeId: store.id,
    secret: decryptSecret(store.webhookSecretEnc, env().STORE_SECRETS_KEY),
  };
}

export function createShopifyStore(input: {
  name: string;
  shopDomain: string;
  currency: string;
  webhookSecret: string;
}) {
  return prisma.store.create({
    data: {
      name: input.name,
      kind: "SHOPIFY",
      shopDomain: input.shopDomain,
      currency: input.currency.toUpperCase(),
      webhookSecretEnc: encryptSecret(input.webhookSecret, env().STORE_SECRETS_KEY),
    },
    select: summary,
  });
}

/** Returns false for an unknown id or the demo store (no secret to rotate). */
export async function rotateWebhookSecret(storeId: string, webhookSecret: string) {
  const { count } = await prisma.store.updateMany({
    where: { id: storeId, kind: "SHOPIFY" },
    data: { webhookSecretEnc: encryptSecret(webhookSecret, env().STORE_SECRETS_KEY) },
  });
  return count === 1;
}

/** Per-store health for the stores page: volumes and last webhook. */
export async function storeStats() {
  const [customers, orders, checkouts, lastEvents] = await Promise.all([
    prisma.customer.groupBy({ by: ["storeId"], _count: { _all: true } }),
    prisma.order.groupBy({ by: ["storeId"], _count: { _all: true } }),
    prisma.checkout.groupBy({
      by: ["storeId"],
      where: { completedAt: null },
      _count: { _all: true },
    }),
    prisma.webhookEvent.groupBy({ by: ["storeId"], _max: { receivedAt: true } }),
  ]);
  const by = <T extends { storeId: string }>(rows: T[]) => new Map(rows.map((r) => [r.storeId, r]));
  return {
    customers: by(customers),
    orders: by(orders),
    abandoned: by(checkouts),
    lastWebhook: by(lastEvents),
  };
}

/** Removes a Shopify store and (cascade) all its data. The demo store cannot be removed. */
export function deleteShopifyStore(storeId: string) {
  return prisma.store.deleteMany({ where: { id: storeId, kind: "SHOPIFY" } });
}

/** Webhook topics a store must subscribe to, in Shopify admin (JSON format). */
export const WEBHOOK_TOPICS = [
  "orders/create",
  "orders/updated",
  "orders/paid",
  "orders/cancelled",
  "customers/create",
  "customers/update",
  "checkouts/create",
  "checkouts/update",
] as const;
