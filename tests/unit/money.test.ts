import { describe, expect, it } from "vitest";
import { centsToPrice, decimalToCents, priceToCents } from "@/lib/money";

describe("priceToCents", () => {
  it.each([
    ["129.90", 12990],
    ["0.1", 10],
    ["10", 1000],
    ["1.005", 100], // truncates beyond cents instead of float rounding surprises
    ["19.99", 1999],
    ["-5.50", -550],
    [" 7.25 ", 725],
  ])("%s -> %i", (input, expected) => {
    expect(priceToCents(input)).toBe(expected);
  });

  it.each(["", "abc", "1,50", "1.2.3", "R$ 10"])("rejects malformed %j", (input) => {
    expect(() => priceToCents(input)).toThrow(/Invalid price/);
  });
});

describe("decimalToCents", () => {
  it("accepts Decimal-like objects and numbers", () => {
    expect(decimalToCents({ toString: () => "259.80" })).toBe(25980);
    expect(decimalToCents(12.5)).toBe(1250);
  });
});

describe("centsToPrice", () => {
  it.each([
    [12990, "129.90"],
    [5, "0.05"],
    [0, "0.00"],
    [-1250, "-12.50"],
  ])("%i -> %s", (cents, price) => {
    expect(centsToPrice(cents)).toBe(price);
    expect(priceToCents(price)).toBe(cents);
  });

  it("rejects non-integers", () => {
    expect(() => centsToPrice(1.5)).toThrow();
  });
});
