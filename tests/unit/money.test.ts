import { describe, expect, it } from "vitest";
import { decimalToCents, formatCents, priceToCents } from "@/lib/money";

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

describe("formatCents", () => {
  it("formats BRL in pt-BR", () => {
    // Intl uses a non-breaking space between symbol and value
    expect(formatCents(12990).replace(/\s/g, " ")).toBe("R$ 129,90");
  });
});
