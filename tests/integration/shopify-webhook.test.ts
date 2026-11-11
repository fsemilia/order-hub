/**
 * End-to-end tests of the webhook pipeline against a real Postgres (DATABASE_URL_TEST):
 * HMAC -> idempotency -> transaction -> ingestion -> customer aggregates.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { signShopifyPayload } from "@/lib/shopify/hmac";
import { handleShopifyWebhook } from "@/lib/shopify/webhooks";
import { rotateWebhookSecret } from "@/lib/stores/stores";
import { createTestStore, prisma, resetDb, TEST_SECRET, TEST_SHOP } from "../support/db";

const baseOrder = JSON.parse(readFileSync("tests/fixtures/orders-create.json", "utf8"));

type DeliverOpts = { id?: string; hmac?: string; shop?: string; secret?: string };

function deliver(topic: string, payload: unknown, opts: DeliverOpts = {}) {
  const raw = JSON.stringify(payload);
  const headers = new Headers({
    "x-shopify-topic": topic,
    "x-shopify-webhook-id": opts.id ?? randomUUID(),
    "x-shopify-shop-domain": opts.shop ?? TEST_SHOP,
    "x-shopify-hmac-sha256": opts.hmac ?? signShopifyPayload(raw, opts.secret ?? TEST_SECRET),
  });
  return handleShopifyWebhook(raw, headers);
}

const order = (overrides: Record<string, unknown> = {}) => ({ ...baseOrder, ...overrides });
let storeId: string;
const customer = () =>
  prisma.customer.findUniqueOrThrow({
    where: { storeId_shopifyId: { storeId, shopifyId: "7234018273645" } },
  });

beforeEach(async () => {
  await resetDb();
  storeId = (await createTestStore()).id;
});

describe("security", () => {
  it("rejects an invalid signature and writes nothing", async () => {
    const res = await deliver("orders/create", order(), { hmac: "forged" });
    expect(res.status).toBe(401);
    expect(await prisma.webhookEvent.count()).toBe(0);
    expect(await prisma.order.count()).toBe(0);
  });

  it("rejects an unknown shop with the same 401 as a bad signature", async () => {
    const res = await deliver("orders/create", order(), { shop: "unknown.myshopify.com" });
    expect(res).toEqual({ status: 401, body: { error: "invalid signature" } });
    expect(await prisma.webhookEvent.count()).toBe(0);
  });

  it("rejects a payload signed with ANOTHER store's secret", async () => {
    await createTestStore("other-shop.myshopify.com", "other_secret");
    const res = await deliver("orders/create", order(), { secret: "other_secret" });
    expect(res.status).toBe(401);
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

describe("store secrets", () => {
  it("rotating the secret switches which signature is accepted; demo/unknown ids are refused", async () => {
    expect(await rotateWebhookSecret(storeId, "rotated_secret_123456")).toBe(true);
    expect((await deliver("orders/create", order())).status).toBe(401);
    expect(
      (await deliver("orders/create", order(), { secret: "rotated_secret_123456" })).status,
    ).toBe(200);
    expect(await rotateWebhookSecret("demo", "x".repeat(20))).toBe(false);
    expect(await rotateWebhookSecret("nope", "x".repeat(20))).toBe(false);
  });

  it("stores the secret encrypted, never in clear", async () => {
    const row = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    expect(row.webhookSecretEnc).toMatch(/^v1\./);
    expect(row.webhookSecretEnc).not.toContain(TEST_SECRET);
  });
});

describe("multi-store", () => {
  it("keeps the same Shopify ids of two stores apart", async () => {
    const other = await createTestStore("other-shop.myshopify.com", "other_secret");
    await deliver("orders/create", order());
    await deliver("orders/create", order(), {
      shop: "other-shop.myshopify.com",
      secret: "other_secret",
    });

    expect(await prisma.order.count()).toBe(2);
    expect(await prisma.order.count({ where: { storeId: other.id } })).toBe(1);
    expect(await prisma.customer.count({ where: { storeId } })).toBe(1);
    expect(await prisma.webhookEvent.count({ where: { storeId: other.id } })).toBe(1);
  });
});

describe("checkouts/*", () => {
  // API 2026-10 shape: no top-level id, the checkout is identified by its token
  const baseCheckout = {
    token: "b1946ac92492d2347c6235b4d2611184",
    name: "#3500000000001",
    email: "joana.silva@example.com",
    total_price: "239.80",
    currency: "brl",
    created_at: "2026-11-01T10:00:00-03:00",
    updated_at: "2026-11-01T10:05:00-03:00",
    completed_at: null,
    abandoned_checkout_url: "https://order-hub-dev.myshopify.com/123/checkouts/abc/recover",
    customer: { id: 7234018273645, first_name: "Joana", email: "joana.silva@example.com" },
    line_items: [
      { title: "Sérum Vitamina C", quantity: 2, price: "119.90" },
      { title: "Brinde", quantity: 1 },
    ],
  };
  const checkout = () => prisma.checkout.findFirstOrThrow({ where: { storeId } });
  const withoutToken = (): Record<string, unknown> => {
    const { token, ...rest } = baseCheckout;
    void token;
    return rest;
  };

  it("stores an abandoned checkout linked to the customer", async () => {
    const res = await deliver("checkouts/create", baseCheckout);
    expect(res.status).toBe(200);
    const c = await checkout();
    expect(c).toMatchObject({ currency: "BRL", itemsCount: 3, completedAt: null });
    expect(c.totalPrice.toString()).toBe("239.8");
    expect(c.customerId).toBe((await customer()).id);
  });

  it("marks it completed on update and ignores stale updates", async () => {
    await deliver("checkouts/create", baseCheckout);
    await deliver("checkouts/update", {
      ...baseCheckout,
      completed_at: "2026-11-01T11:00:00-03:00",
      updated_at: "2026-11-01T11:00:00-03:00",
    });
    const stale = await deliver("checkouts/update", baseCheckout);

    expect(stale.body).toMatchObject({ result: { status: "stale" } });
    expect((await checkout()).completedAt).not.toBeNull();
    expect(await prisma.checkout.count()).toBe(1);
  });

  it("a checkout never brings back a redacted customer's email (LGPD)", async () => {
    await deliver("checkouts/create", baseCheckout);
    await deliver("customers/redact", { shop_domain: TEST_SHOP, customer: { id: 7234018273645 } });
    await deliver("checkouts/update", { ...baseCheckout, updated_at: "2026-11-02T10:00:00-03:00" });
    expect((await checkout()).email).toBeNull();
  });

  it("customers/redact also wipes guest checkouts with the same email", async () => {
    await deliver("checkouts/create", { ...baseCheckout, customer: null });
    await deliver("customers/redact", {
      shop_domain: TEST_SHOP,
      customer: { id: 7234018273645, email: "Joana.Silva@example.com" },
    });
    expect((await checkout()).email).toBeNull();
  });

  it("does not let a checkout overwrite newer customer consent or names", async () => {
    await deliver("customers/update", {
      id: 7234018273645,
      first_name: "Joana",
      email: "joana.silva@example.com",
      email_marketing_consent: { state: "unsubscribed" },
    });
    await deliver("checkouts/create", {
      ...baseCheckout,
      customer: { ...baseCheckout.customer, first_name: "Old", accepts_marketing: true },
    });
    expect(await customer()).toMatchObject({ firstName: "Joana", acceptsMarketing: false });
  });

  it("keys the checkout by its token (API 2026-10 sends no id)", async () => {
    await deliver("checkouts/create", baseCheckout);
    expect((await checkout()).shopifyId).toBe(baseCheckout.token);
  });

  it("prefers the token when a payload has both token and id; empty token falls back to id", async () => {
    await deliver("checkouts/create", { ...baseCheckout, id: 3500000000001 });
    expect((await checkout()).shopifyId).toBe(baseCheckout.token);
    await prisma.checkout.deleteMany();
    await deliver("checkouts/create", { ...baseCheckout, token: "", id: 3500000000002 });
    expect((await checkout()).shopifyId).toBe("3500000000002");
  });

  it("the order that completes a checkout marks the cart as recovered", async () => {
    await deliver("checkouts/create", baseCheckout);
    await deliver("orders/create", order({ checkout_token: baseCheckout.token }));
    expect((await checkout()).completedAt).not.toBeNull();
  });

  it("still accepts older payloads keyed by a numeric id + checkout_id", async () => {
    await deliver("checkouts/create", { ...withoutToken(), id: 3500000000001 });
    expect((await checkout()).shopifyId).toBe("3500000000001");
    await deliver("orders/create", order({ checkout_id: 3500000000001 }));
    expect((await checkout()).completedAt).not.toBeNull();
  });

  it("rejects a checkout with neither token nor id (422, nothing written)", async () => {
    const res = await deliver("checkouts/create", withoutToken());
    expect(res.status).toBe(422);
    expect(await prisma.checkout.count()).toBe(0);
    expect(await prisma.webhookEvent.count()).toBe(0);
  });

  it("rejects a non-https recovery URL", async () => {
    const res = await deliver("checkouts/create", {
      ...baseCheckout,
      abandoned_checkout_url: "javascript:alert(1)",
    });
    expect(res.status).toBe(422);
  });

  it("customers/redact also removes the email from checkouts", async () => {
    await deliver("checkouts/create", baseCheckout);
    await deliver("customers/redact", {
      shop_domain: TEST_SHOP,
      customer: { id: 7234018273645 },
    });
    expect((await checkout()).email).toBeNull();
  });
});

describe("unknown topics", () => {
  it("acknowledges with 200 so Shopify does not retry forever", async () => {
    const res = await deliver("products/update", { id: 1 });
    expect(res).toEqual({ status: 200, body: { ok: true, ignored: "products/update" } });
  });
});
