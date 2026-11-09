import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { verifyShopifyHmac } from "./hmac";
import { ingestOrder, redactCustomer, upsertCustomer } from "./ingest";
import { customersRedactSchema, shopifyCustomerSchema, shopifyOrderSchema } from "./schemas";

type Handler = (tx: Prisma.TransactionClient, payload: unknown) => Promise<unknown>;

/** Topic -> handler. Adding a topic = one entry here + subscription in shopify.app.toml + tests. */
export const HANDLERS: Record<string, Handler> = {
  "orders/create": (tx, p) => ingestOrder(tx, shopifyOrderSchema.parse(p)),
  "orders/updated": (tx, p) => ingestOrder(tx, shopifyOrderSchema.parse(p)),
  "orders/paid": (tx, p) => ingestOrder(tx, shopifyOrderSchema.parse(p)),
  "orders/cancelled": (tx, p) => ingestOrder(tx, shopifyOrderSchema.parse(p)),
  "customers/create": (tx, p) => upsertCustomer(tx, shopifyCustomerSchema.parse(p)),
  "customers/update": (tx, p) => upsertCustomer(tx, shopifyCustomerSchema.parse(p)),
  "customers/redact": (tx, p) => redactCustomer(tx, customersRedactSchema.parse(p).customer.id),
};

export type WebhookOutcome =
  | { status: 200; body: { ok: true; topic: string; result?: unknown } }
  | { status: 200; body: { ok: true; duplicate: true } }
  | { status: 200; body: { ok: true; ignored: string } }
  | { status: 400 | 401 | 403 | 422; body: { error: string } };

/**
 * Full webhook pipeline, independent of Next.js so it can be integration-tested directly.
 *
 * 1. HMAC on the raw body                       -> 401
 * 2. Required headers / shop allowlist          -> 400 / 403
 * 3. Event log + domain write in ONE transaction: either both happen or neither
 * 4. Duplicate delivery (P2002 on event id)     -> 200 { duplicate } (Shopify must stop retrying)
 * 5. Invalid payload                            -> 422 (logged; rolled back)
 * 6. Anything else throws                       -> 500, Shopify retries with backoff
 */
export async function handleShopifyWebhook(
  rawBody: string,
  headers: Headers,
): Promise<WebhookOutcome> {
  const { SHOPIFY_WEBHOOK_SECRET, SHOPIFY_SHOP_DOMAIN } = env();

  if (!verifyShopifyHmac(rawBody, headers.get("x-shopify-hmac-sha256"), SHOPIFY_WEBHOOK_SECRET)) {
    logger.warn("webhook.invalid_hmac");
    return { status: 401, body: { error: "invalid signature" } };
  }

  const webhookId = headers.get("x-shopify-webhook-id") ?? headers.get("x-shopify-event-id");
  const topic = headers.get("x-shopify-topic");
  const shopDomain = headers.get("x-shopify-shop-domain");
  if (!webhookId || !topic) return { status: 400, body: { error: "missing webhook headers" } };
  if (SHOPIFY_SHOP_DOMAIN && shopDomain !== SHOPIFY_SHOP_DOMAIN) {
    logger.warn("webhook.unknown_shop", { shopDomain });
    return { status: 403, body: { error: "unknown shop" } };
  }

  const handler = HANDLERS[topic];
  const log = { webhookId, topic, shopDomain };

  try {
    const payload: unknown = JSON.parse(rawBody);
    const result = await prisma.$transaction(async (tx) => {
      await tx.webhookEvent.create({ data: { id: webhookId, topic, shopDomain } });
      return handler ? handler(tx, payload) : undefined;
    });

    if (!handler) {
      logger.info("webhook.ignored_topic", log);
      return { status: 200, body: { ok: true, ignored: topic } };
    }
    logger.info("webhook.processed", { ...log, result });
    return { status: 200, body: { ok: true, topic, result } };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      logger.info("webhook.duplicate", log);
      return { status: 200, body: { ok: true, duplicate: true } };
    }
    if (e instanceof z.ZodError || e instanceof SyntaxError) {
      logger.error("webhook.invalid_payload", { ...log, issues: e.message });
      return { status: 422, body: { error: "invalid payload" } };
    }
    logger.error("webhook.failed", { ...log, error: String(e) });
    throw e;
  }
}
