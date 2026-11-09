/**
 * Sends a Shopify-signed webhook to a running Order Hub, without needing a real store.
 *
 *   npm run webhook:send                                  # orders/create to localhost
 *   npm run webhook:send -- --topic orders/updated --status refunded
 *   npm run webhook:send -- --url https://order-hub.vercel.app/api/webhooks/shopify
 *   npm run webhook:send -- --repeat 2                    # same webhook id twice → idempotency
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { signShopifyPayload } from "../lib/shopify/hmac";

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:3000/api/webhooks/shopify" },
    topic: { type: "string", default: "orders/create" },
    status: { type: "string" },
    repeat: { type: "string", default: "1" },
    fixture: { type: "string", default: "tests/fixtures/orders-create.json" },
  },
});

const secret = process.env.SHOPIFY_WEBHOOK_SECRET ?? "";
if (!secret) throw new Error("SHOPIFY_WEBHOOK_SECRET is not set");

const payload = JSON.parse(readFileSync(values.fixture!, "utf8"));
payload.updated_at = new Date().toISOString();
if (values.status) payload.financial_status = values.status;
const body = JSON.stringify(payload);
const webhookId = randomUUID();

async function main() {
  for (let i = 0; i < Number(values.repeat); i++) {
    const res = await fetch(values.url!, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shopify-topic": values.topic!,
        "x-shopify-hmac-sha256": signShopifyPayload(body, secret),
        "x-shopify-webhook-id": webhookId,
        "x-shopify-shop-domain": process.env.SHOPIFY_SHOP_DOMAIN || "order-hub-dev.myshopify.com",
        "x-shopify-api-version": "2026-10",
      },
      body,
    });
    console.log(`${values.topic} [${webhookId}] -> ${res.status}`, await res.text());
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
