import { describe, expect, it } from "vitest";
import { signShopifyPayload, verifyShopifyHmac } from "@/lib/shopify/hmac";

const SECRET = "test_secret";
const body = '{"id":1,"total_price":"129.90"}';

describe("verifyShopifyHmac", () => {
  it("accepts a valid signature", () => {
    expect(verifyShopifyHmac(body, signShopifyPayload(body, SECRET), SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(
      verifyShopifyHmac(body.replace("129.90", "1.00"), signShopifyPayload(body, SECRET), SECRET),
    ).toBe(false);
  });

  it("rejects a signature made with another secret", () => {
    expect(verifyShopifyHmac(body, signShopifyPayload(body, "other"), SECRET)).toBe(false);
  });

  it("rejects a missing header or an empty secret", () => {
    expect(verifyShopifyHmac(body, null, SECRET)).toBe(false);
    expect(verifyShopifyHmac(body, signShopifyPayload(body, ""), "")).toBe(false);
  });

  it("rejects a header of different length without throwing", () => {
    expect(verifyShopifyHmac(body, "abc", SECRET)).toBe(false);
  });

  it("fails if the body is re-serialized (the classic bug)", () => {
    const pretty = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifyShopifyHmac(pretty, signShopifyPayload(body, SECRET), SECRET)).toBe(false);
  });
});
