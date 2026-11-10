import { describe, expect, it } from "vitest";
import { normalizeShopDomain } from "@/lib/stores/domain";

describe("normalizeShopDomain", () => {
  it.each([
    ["https://sitoweb1.myshopify.com", "sitoweb1.myshopify.com"],
    ["https://SitoWeb1.myshopify.com/admin/orders?x=1", "sitoweb1.myshopify.com"],
    ["  sitoweb1  ", "sitoweb1.myshopify.com"],
    ["my-store.myshopify.com", "my-store.myshopify.com"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeShopDomain(input)).toBe(expected);
  });

  it.each(["", "https://example.com", "evil.myshopify.com.attacker.io", "-bad.myshopify.com", "a b"])(
    "rejects %j",
    (input) => {
      expect(normalizeShopDomain(input)).toBeNull();
    },
  );
});
