// CRM segmentation rules. Pure functions (no DB): unit-tested in tests/unit/segments.test.ts.
//
//   sem_compras  no paid orders yet
//   em_risco     last paid order older than `riskDays`  (takes precedence: a lapsed VIP is at risk)
//   recorrente   2+ paid orders, last one within `riskDays`
//   novo         exactly 1 paid order, within `riskDays`
//
// The segment depends on "now", so it is never stored: it is derived from the denormalized
// aggregates on Customer (ordersCount, lastOrderAt), both in JS and as a Prisma `where`.
import type { Prisma } from "@/generated/prisma/client";

export const SEGMENTS = ["novo", "recorrente", "em_risco", "sem_compras"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const DAY_MS = 24 * 60 * 60 * 1000;

export function isSegment(value: unknown): value is Segment {
  return typeof value === "string" && (SEGMENTS as readonly string[]).includes(value);
}

export function riskCutoff(now: Date, riskDays: number): Date {
  return new Date(now.getTime() - riskDays * DAY_MS);
}

export function segmentOf(
  c: { ordersCount: number; lastOrderAt: Date | null },
  now: Date,
  riskDays: number,
): Segment {
  if (c.ordersCount === 0 || !c.lastOrderAt) return "sem_compras";
  if (c.lastOrderAt < riskCutoff(now, riskDays)) return "em_risco";
  return c.ordersCount >= 2 ? "recorrente" : "novo";
}

/** The same rules as `segmentOf`, expressed as a Prisma filter so the DB does the work. */
export function segmentWhere(
  segment: Segment,
  now: Date,
  riskDays: number,
): Prisma.CustomerWhereInput {
  const cutoff = riskCutoff(now, riskDays);
  switch (segment) {
    case "sem_compras":
      return { ordersCount: 0 };
    case "em_risco":
      return { ordersCount: { gt: 0 }, lastOrderAt: { lt: cutoff } };
    case "recorrente":
      return { ordersCount: { gte: 2 }, lastOrderAt: { gte: cutoff } };
    case "novo":
      return { ordersCount: 1, lastOrderAt: { gte: cutoff } };
  }
}

/** Shopify financial statuses that count as revenue. */
export const REVENUE_STATUSES = ["paid", "partially_paid", "partially_refunded"] as const;

export function countsAsRevenue(o: { financialStatus: string; cancelledAt: Date | null }): boolean {
  return (REVENUE_STATUSES as readonly string[]).includes(o.financialStatus) && !o.cancelledAt;
}
