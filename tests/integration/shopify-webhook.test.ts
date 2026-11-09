/**
 * End-to-end tests of the webhook pipeline against a real Postgres (DATABASE_URL_TEST):
 * HMAC -> idempotency -> transaction -> ingestion -> customer aggregates.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { signShopifyPayload } from "@/lib/shopify/hmac";
import { handleShopifyWebhook } from "@/lib/shopify/webhooks";
import { prisma, resetDb } from "../support/db";

const SECRET = "test_webhook_secret";
const baseOrder = JSON.parse(readFileSync("tests/fixtures/orders-create.json", "utf8"));

function deliver(topic: string, payload: unknown, opts: { id?: string; hmac?: string } = {}) {
  const raw = JSON.stringify(payload);
  const headers = new Headers({
    "x-shopify-topic": topic,
    "x-shopify-webhook-id": opts.id ?? randomUUID(),
    "x-shopify-shop-domain": "order-hub-dev.myshopify.com",
    "x-shopify-hmac-sha256": opts.hmac ?? signShopifyPayload(raw, SECRET),
  });
  return handleShopifyWebhook(raw, headers);
}

const order = (overrides: Record<string, unknown> = {}) => ({ ...baseOrder, ...overrides });
const customer = () => prisma.customer.findUniqueOrThrow({ where: { shopifyId: "7234018273645" } });

beforeEach(resetDb);

describe("security", () => {
  it("rejects an invalid signature and writes nothing", async () => {
    const res = await deliver("orders/create", order(), { hmac: "forged" });
    expect(res.status).toBe(401);
    expect(await prisma.webhookEvent.count()).toBe(0);
    expect(await prisma.order.count()).toBe(0);
  });

  it("returns 422 and rolls back the event log on an invalid payload", async () => {
    const res = await deliver("orders/create", order({ total_price: 10 }));
    expect(res.status).toBe(422);
    // rolled back: Shopify's retry of the same id can still be processed after a fix
    expect(await prisma.webhookEvent.count()).toBe(0);
  });
});

describe("orders/create", () => {
  it("creates customer, order, line items and aggregates", async () => {
    const res = await deliver("orders/create", order());
    expect(res.status).toBe(200);

    const c = await customer();
    expect(c).toMatchObject({
      firstName: "Joana",
      email: "joana.silva@example.com",
      acceptsMarketing: true,
      ordersCount: 1,
    });
    expect(c.totalSpent.toString()).toBe("259.8");
    expect(await prisma.orderLineItem.count()).toBe(1);
  });

  it("is idempotent: the same webhook id delivered twice is processed once", async () => {
    const id = randomUUID();
    await deliver("orders/create", order(), { id });
    const second = await deliver("orders/create", order(), { id });

    expect(second).toEqual({ status: 200, body: { ok: true, duplicate: true } });
    expect(await prisma.order.count()).toBe(1);
    expect((await customer()).ordersCount).toBe(1);
  });

  it("does not duplicate the order when Shopify re-sends it with a new webhook id", async () => {
    await deliver("orders/create", order());
    await deliver("orders/create", order());
    expect(await prisma.order.count()).toBe(1);
  });

  it("supports guest checkouts without a customer", async () => {
    await deliver("orders/create", order({ customer: null }));
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.customer.count()).toBe(0);
  });
});

describe("orders/updated", () => {
  it("recomputes LTV after a partial refund (current_total_price)", async () => {
    await deliver("orders/create", order());
    await deliver(
      "orders/updated",
      order({
        financial_status: "partially_refunded",
        current_total_price: "139.90",
        updated_at: "2026-11-02T09:00:00-03:00",
      }),
    );
    expect((await customer()).totalSpent.toString()).toBe("139.9");
  });

  it("removes a fully refunded order from LTV and order count", async () => {
    await deliver("orders/create", order());
    await deliver(
      "orders/updated",
      order({ financial_status: "refunded", updated_at: "2026-11-02T09:00:00-03:00" }),
    );
    const c = await customer();
    expect(c.ordersCount).toBe(0);
    expect(c.totalSpent.toString()).toBe("0");
  });

  it("ignores a stale update that arrives out of order", async () => {
    await deliver(
      "orders/updated",
      order({ financial_status: "refunded", updated_at: "2026-11-05T00:00:00Z" }),
    );
    const res = await deliver(
      "orders/create",
      order({ financial_status: "paid", updated_at: "2026-11-01T13:15:30Z" }),
    );

    expect(res.body).toMatchObject({ result: { status: "stale" } });
    const o = await prisma.order.findFirstOrThrow();
    expect(o.financialStatus).toBe("refunded");
  });

  it("replaces line items when the order is edited", async () => {
    await deliver("orders/create", order());
    await deliver(
      "orders/updated",
      order({
        updated_at: "2026-11-02T09:00:00-03:00",
        line_items: [
          { id: 1, title: "Produto A", quantity: 1, price: "10.00" },
          { id: 2, title: "Produto B", quantity: 1, price: "20.00" },
        ],
      }),
    );
    const titles = (await prisma.orderLineItem.findMany({ orderBy: { title: "asc" } })).map(
      (li) => li.title,
    );
    expect(titles).toEqual(["Produto A", "Produto B"]);
  });
});

describe("orders/cancelled", () => {
  it("excludes cancelled orders from aggregates", async () => {
    await deliver("orders/create", order());
    await deliver(
      "orders/cancelled",
      order({ cancelled_at: "2026-11-02T09:00:00-03:00", updated_at: "2026-11-02T09:00:00-03:00" }),
    );
    expect((await customer()).ordersCount).toBe(0);
  });
});

describe("customers/redact (LGPD)", () => {
  it("wipes PII, keeps anonymous revenue, and never resurrects it", async () => {
    await deliver("orders/create", order());
    await deliver("customers/redact", {
      shop_domain: "order-hub-dev.myshopify.com",
      customer: { id: 7234018273645 },
    });

    let c = await customer();
    expect(c).toMatchObject({ email: null, firstName: null, lastName: null, phone: null });
    expect(c.redactedAt).not.toBeNull();
    expect(c.ordersCount).toBe(1);

    // A later order webhook for the same customer must not bring the PII back
    await deliver("orders/updated", order({ updated_at: "2026-11-03T00:00:00Z" }));
    c = await customer();
    expect(c.email).toBeNull();
  });
});

describe("unknown topics", () => {
  it("acknowledges with 200 so Shopify does not retry forever", async () => {
    const res = await deliver("products/update", { id: 1 });
    expect(res).toEqual({ status: 200, body: { ok: true, ignored: "products/update" } });
  });
});
