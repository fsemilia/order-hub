import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getWebhookTarget } from "@/lib/stores/stores";
import { verifyShopifyHmac } from "./hmac";
import { ingestCheckout, ingestOrder, redactCustomer, upsertCustomer } from "./ingest";
import {
  customersRedactSchema,
  shopifyCheckoutSchema,
  shopifyCustomerSchema,
  shopifyOrderSchema,
} from "./schemas";

type Handler = (
  tx: Prisma.TransactionClient,
  storeId: string,
  payload: unknown,
) => Promise<unknown>;

const order: Handler = (tx, storeId, p) => ingestOrder(tx, storeId, shopifyOrderSchema.parse(p));
const customer: Handler = (tx, storeId, p) =>
  upsertCustomer(tx, storeId, shopifyCustomerSchema.parse(p));
const checkout: Handler = (tx, storeId, p) =>
  ingestCheckout(tx, storeId, shopifyCheckoutSchema.parse(p));

/** Topic -> handler. Adding a topic = one entry here + subscription in Shopify + tests. */
export const HANDLERS: Record<string, Handler> = {
  "orders/create": order,
  "orders/updated": order,
  "orders/paid": order,
  "orders/cancelled": order,
  "customers/create": customer,
  "customers/update": customer,
  "customers/redact": (tx, storeId, p) =>
    redactCustomer(tx, storeId, customersRedactSchema.parse(p).customer),
  "checkouts/create": checkout,
  "checkouts/update": checkout,
};

export type WebhookOutcome =
  | { status: 200; body: { ok: true; topic: string; result?: unknown } }
  | { status: 200; body: { ok: true; duplicate: true } }
  | { status: 200; body: { ok: true; ignored: string } }
  | { status: 400 | 401 | 422; body: { error: string } };

const DUPLICATE = Symbol("duplicate");

/**
 * Full webhook pipeline, independent of Next.js so it can be integration-tested directly.
 *
 * 1. Resolve the store from X-Shopify-Shop-Domain   -> unknown shop: 401
 * 2. HMAC on the raw body with THAT store's secret  -> 401
 * 3. Event log + domain write in ONE transaction: either both happen or neither
 * 4. Duplicate delivery (event id already logged)   -> 200 { duplicate } (Shopify must stop retrying)
 * 5. Invalid payload                                -> 422 (logged; rolled back)
 * 6. Anything else throws                           -> 500, Shopify retries with backoff
 */
export async function handleShopifyWebhook(
  rawBody: string,
  headers: Headers,
): Promise<WebhookOutcome> {
  const shopDomain = headers.get("x-shopify-shop-domain")?.toLowerCase() ?? "";
  const target = shopDomain ? await getWebhookTarget(shopDomain) : null;

  // Same response for "unknown shop" and "bad signature": do not reveal which shops exist.
  if (!target || !verifyShopifyHmac(rawBody, headers.get("x-shopify-hmac-sha256"), target.secret)) {
    logger.warn("webhook.unauthorized", { shopDomain, knownShop: Boolean(target) });
    return { status: 401, body: { error: "invalid signature" } };
  }

  const webhookId = headers.get("x-shopify-webhook-id") ?? headers.get("x-shopify-event-id");
  const topic = headers.get("x-shopify-topic");
  if (!webhookId || !topic) return { status: 400, body: { error: "missing webhook headers" } };

  const { storeId } = target;
  const handler = HANDLERS[topic];
  const log = { webhookId, topic, shopDomain, storeId };

  try {
    const payload: unknown = JSON.parse(rawBody);
    const result = await prisma.$transaction(async (tx) => {
      // Explicit duplicate detection. A unique violation anywhere else (e.g. two deliveries of
      // the same order racing) must NOT be mistaken for a duplicate: it throws -> 500 -> retry.
      const { count } = await tx.webhookEvent.createMany({
        data: [{ id: webhookId, storeId, topic, shopDomain }],
        skipDuplicates: true,
      });
      if (count === 0) return DUPLICATE;
      return handler ? handler(tx, storeId, payload) : undefined;
    });

    if (result === DUPLICATE) {
      logger.info("webhook.duplicate", log);
      return { status: 200, body: { ok: true, duplicate: true } };
    }
    if (!handler) {
      logger.info("webhook.ignored_topic", log);
      return { status: 200, body: { ok: true, ignored: topic } };
    }
    logger.info("webhook.processed", { ...log, result });
    return { status: 200, body: { ok: true, topic, result } };
  } catch (e) {
    if (e instanceof z.ZodError || e instanceof SyntaxError) {
      logger.error("webhook.invalid_payload", { ...log, issues: e.message });
      return { status: 422, body: { error: "invalid payload" } };
    }
    logger.error("webhook.failed", { ...log, error: String(e) });
    throw e;
  }
}
