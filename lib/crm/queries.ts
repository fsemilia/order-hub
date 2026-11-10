import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { decimalToCents } from "@/lib/money";
import {
  DAY_MS,
  REVENUE_STATUSES,
  SEGMENTS,
  segmentOf,
  segmentWhere,
  type Segment,
} from "./segments";

// Every read model is scoped to ONE store (storeId comes from requireStoreContext()).

const revenueOrder: Prisma.OrderWhereInput = {
  financialStatus: { in: [...REVENUE_STATUSES] },
  cancelledAt: null,
};

export const PAGE_SIZE = 25;

export type CustomerRow = {
  id: string;
  /** null when the customer has no name; the UI renders a translated placeholder */
  name: string | null;
  redacted: boolean;
  email: string | null;
  ordersCount: number;
  ltvCents: number;
  avgTicketCents: number;
  lastOrderAt: Date | null;
  segment: Segment;
};

function toRow(
  c: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    redactedAt: Date | null;
    ordersCount: number;
    totalSpent: Prisma.Decimal;
    lastOrderAt: Date | null;
  },
  now: Date,
  riskDays: number,
): CustomerRow {
  const ltvCents = decimalToCents(c.totalSpent);
  return {
    id: c.id,
    name: [c.firstName, c.lastName].filter(Boolean).join(" ") || null,
    redacted: Boolean(c.redactedAt),
    email: c.email,
    ordersCount: c.ordersCount,
    ltvCents,
    avgTicketCents: c.ordersCount ? Math.round(ltvCents / c.ordersCount) : 0,
    lastOrderAt: c.lastOrderAt,
    segment: segmentOf(c, now, riskDays),
  };
}

export type ListCustomersParams = {
  segment?: Segment;
  q?: string;
  page?: number;
  sort?: "ltv" | "recent";
  limit?: number;
};

export async function listCustomers(
  storeId: string,
  params: ListCustomersParams,
  now = new Date(),
) {
  const riskDays = env().CRM_RISK_DAYS;
  const limit = params.limit ?? PAGE_SIZE;
  const page = Math.max(1, params.page ?? 1);
  const q = params.q?.trim();

  const where: Prisma.CustomerWhereInput = {
    storeId,
    redactedAt: null,
    ...(params.segment ? segmentWhere(params.segment, now, riskDays) : {}),
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, customers] = await prisma.$transaction([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy:
        params.sort === "recent"
          ? [{ lastOrderAt: { sort: "desc", nulls: "last" } }]
          : [{ totalSpent: "desc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / limit)),
    rows: customers.map((c) => toRow(c, now, riskDays)),
  };
}

export async function getCustomerDetail(storeId: string, id: string, now = new Date()) {
  const riskDays = env().CRM_RISK_DAYS;
  // storeId in the filter: an id from another store is "not found", never leaked.
  const customer = await prisma.customer.findFirst({
    where: { id, storeId },
    include: {
      orders: {
        orderBy: { placedAt: "desc" },
        take: 50,
        include: { lineItems: { select: { title: true, quantity: true } } },
      },
    },
  });
  if (!customer) return null;

  return {
    ...toRow(customer, now, riskDays),
    phone: customer.phone,
    acceptsMarketing: customer.acceptsMarketing,
    firstOrderAt: customer.firstOrderAt,
    daysSinceLastOrder: customer.lastOrderAt
      ? Math.floor((now.getTime() - customer.lastOrderAt.getTime()) / DAY_MS)
      : null,
    orders: customer.orders.map((o) => ({
      id: o.id,
      name: o.name,
      placedAt: o.placedAt,
      totalCents: decimalToCents(o.totalPrice),
      currency: o.currency,
      financialStatus: o.financialStatus,
      cancelled: Boolean(o.cancelledAt),
      items: o.lineItems.map((li) => `${li.quantity}× ${li.title}`),
    })),
  };
}

export type StoreOverview = Awaited<ReturnType<typeof getStoreOverview>>;

export async function getStoreOverview(storeId: string, now = new Date()) {
  const riskDays = env().CRM_RISK_DAYS;
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const since90 = new Date(now.getTime() - 90 * DAY_MS);
  const revenue = { storeId, ...revenueOrder };

  const [segmentCounts, rev30, rev90, allTime, topProducts, lastWebhook, abandoned7] =
    await Promise.all([
      Promise.all(
        SEGMENTS.map(async (s) => ({
          segment: s,
          count: await prisma.customer.count({
            where: { storeId, redactedAt: null, ...segmentWhere(s, now, riskDays) },
          }),
        })),
      ),
      prisma.order.aggregate({
        where: { ...revenue, placedAt: { gte: since30 } },
        _sum: { totalPrice: true },
        _count: { _all: true },
      }),
      prisma.order.aggregate({
        where: { ...revenue, placedAt: { gte: since90 } },
        _sum: { totalPrice: true },
        _count: { _all: true },
      }),
      prisma.order.aggregate({
        where: revenue,
        _sum: { totalPrice: true },
        _count: { _all: true },
      }),
      prisma.orderLineItem.groupBy({
        by: ["title"],
        where: { order: { ...revenue, placedAt: { gte: since90 } } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5,
      }),
      prisma.webhookEvent.findFirst({
        where: { storeId },
        orderBy: { receivedAt: "desc" },
        select: { receivedAt: true },
      }),
      prisma.checkout.aggregate({
        where: { storeId, completedAt: null, startedAt: { gte: since7 } },
        _sum: { totalPrice: true },
        _count: { _all: true },
      }),
    ]);

  const cents = (d: Prisma.Decimal | null) => (d ? decimalToCents(d) : 0);
  const allTimeCents = cents(allTime._sum.totalPrice);

  return {
    riskDays,
    segments: segmentCounts,
    customersTotal: segmentCounts.reduce((s, x) => s + x.count, 0),
    revenue30Cents: cents(rev30._sum.totalPrice),
    orders30: rev30._count._all,
    revenue90Cents: cents(rev90._sum.totalPrice),
    orders90: rev90._count._all,
    avgTicketCents: allTime._count._all ? Math.round(allTimeCents / allTime._count._all) : 0,
    topProducts90: topProducts.map((p) => ({ title: p.title, quantity: p._sum.quantity ?? 0 })),
    lastWebhookAt: lastWebhook?.receivedAt ?? null,
    abandoned7Cents: cents(abandoned7._sum.totalPrice),
    abandoned7Count: abandoned7._count._all,
  };
}

export type AbandonedCheckoutRow = Awaited<ReturnType<typeof listAbandonedCheckouts>>[number];

/** Checkouts never completed, most recent first. */
export async function listAbandonedCheckouts(storeId: string, limit = 50) {
  const rows = await prisma.checkout.findMany({
    where: { storeId, completedAt: null },
    orderBy: { startedAt: "desc" },
    take: limit,
    include: {
      customer: { select: { id: true, firstName: true, redactedAt: true, acceptsMarketing: true } },
    },
  });
  return rows.map((c) => ({
    id: c.id,
    customerId: c.customer?.id ?? null,
    firstName: c.customer?.redactedAt ? null : (c.customer?.firstName ?? null),
    acceptsMarketing: c.customer?.acceptsMarketing ?? false,
    email: c.email,
    totalCents: decimalToCents(c.totalPrice),
    currency: c.currency,
    itemsCount: c.itemsCount,
    items: (c.items as { title: string; quantity: number }[]).map(
      (i) => `${i.quantity}× ${i.title}`,
    ),
    recoveryUrl: c.abandonedCheckoutUrl,
    startedAt: c.startedAt,
  }));
}
