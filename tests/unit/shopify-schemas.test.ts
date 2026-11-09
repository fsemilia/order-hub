import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { acceptsMarketing, shopifyOrderSchema } from "@/lib/shopify/schemas";

const fixture = JSON.parse(readFileSync("tests/fixtures/orders-create.json", "utf8"));

describe("shopifyOrderSchema", () => {
  it("parses a real orders/create payload and normalizes ids and dates", () => {
    const o = shopifyOrderSchema.parse(fixture);
    expect(o.id).toBe("5873419862345");
    expect(o.customer?.id).toBe("7234018273645");
    expect(o.created_at).toEqual(new Date("2026-11-01T13:15:00Z"));
    expect(o.line_items).toHaveLength(1);
  });

  it("strips fields we do not use", () => {
    const o = shopifyOrderSchema.parse(fixture) as Record<string, unknown>;
    expect(o.shipping_lines).toBeUndefined();
  });

  it("rejects money as a float (prices must stay decimal strings)", () => {
    expect(() => shopifyOrderSchema.parse({ ...fixture, total_price: 259.8 })).toThrow();
  });

  it("accepts guest checkouts (no customer)", () => {
    expect(shopifyOrderSchema.parse({ ...fixture, customer: null }).customer).toBeNull();
  });
});

describe("acceptsMarketing", () => {
  it("prefers email_marketing_consent over the legacy flag", () => {
    expect(
      acceptsMarketing({
        id: "1",
        email_marketing_consent: { state: "subscribed" },
        accepts_marketing: false,
      }),
    ).toBe(true);
    expect(
      acceptsMarketing({
        id: "1",
        email_marketing_consent: { state: "unsubscribed" },
        accepts_marketing: true,
      }),
    ).toBe(false);
    expect(acceptsMarketing({ id: "1", accepts_marketing: true })).toBe(true);
    expect(acceptsMarketing({ id: "1" })).toBe(false);
  });
});
