import { describe, expect, it } from "vitest";
import { countsAsRevenue, isSegment, segmentOf, segmentWhere } from "@/lib/crm/segments";

const NOW = new Date("2026-11-09T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const RISK = 60;

describe("segmentOf", () => {
  it.each([
    [{ ordersCount: 0, lastOrderAt: null }, "sem_compras"],
    [{ ordersCount: 1, lastOrderAt: daysAgo(5) }, "novo"],
    [{ ordersCount: 3, lastOrderAt: daysAgo(10) }, "recorrente"],
    [{ ordersCount: 1, lastOrderAt: daysAgo(61) }, "em_risco"],
    // a lapsed VIP is "em_risco", not "recorrente": risk takes precedence
    [{ ordersCount: 12, lastOrderAt: daysAgo(90) }, "em_risco"],
    // boundary: exactly 60 days is still active
    [{ ordersCount: 2, lastOrderAt: daysAgo(60) }, "recorrente"],
  ] as const)("%o -> %s", (customer, expected) => {
    expect(segmentOf(customer, NOW, RISK)).toBe(expected);
  });

  it("respects a custom risk window", () => {
    expect(segmentOf({ ordersCount: 1, lastOrderAt: daysAgo(40) }, NOW, 30)).toBe("em_risco");
  });
});

describe("segmentWhere", () => {
  const cutoff = daysAgo(RISK);

  it("builds the same rules as segmentOf, as Prisma filters", () => {
    expect(segmentWhere("sem_compras", NOW, RISK)).toEqual({ ordersCount: 0 });
    expect(segmentWhere("em_risco", NOW, RISK)).toEqual({
      ordersCount: { gt: 0 },
      lastOrderAt: { lt: cutoff },
    });
    expect(segmentWhere("recorrente", NOW, RISK)).toEqual({
      ordersCount: { gte: 2 },
      lastOrderAt: { gte: cutoff },
    });
    expect(segmentWhere("novo", NOW, RISK)).toEqual({
      ordersCount: 1,
      lastOrderAt: { gte: cutoff },
    });
  });
});

describe("countsAsRevenue", () => {
  it.each([
    ["paid", null, true],
    ["partially_refunded", null, true],
    ["refunded", null, false],
    ["pending", null, false],
    ["voided", null, false],
    ["paid", new Date(), false], // cancelled
  ] as const)("%s cancelled=%s -> %s", (financialStatus, cancelledAt, expected) => {
    expect(countsAsRevenue({ financialStatus, cancelledAt })).toBe(expected);
  });
});

describe("isSegment", () => {
  it("guards untrusted input (e.g. ?segment= from the URL)", () => {
    expect(isSegment("em_risco")).toBe(true);
    expect(isSegment("admin")).toBe(false);
    expect(isSegment(undefined)).toBe(false);
  });
});
