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

const revenueOrder: Prisma.OrderWhereInput = {
  financialStatus: { in: [...REVENUE_STATUSES] },
  cancelledAt: null,
};

export const PAGE_SIZE = 25;

export type CustomerRow = {
  id: string;
  name: string;
  email: string | null;
  ordersCount: number;
  ltvCents: number;
  avgTicketCents: number;
  lastOrderAt: Date | null;
  segment: Segment;
};

function displayName(c: {
  firstName: string | null;
  lastName: string | null;
  redactedAt?: Date | null;
}) {
  if (c.redactedAt) return "Cliente anonimizado";
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || "Sem nome";
}

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
    name: displayName(c),
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

export async function listCustomers(params: ListCustomersParams, now = new Date()) {
  const riskDays = env().CRM_RISK_DAYS;
  const limit = params.limit ?? PAGE_SIZE;
  const page = Math.max(1, params.page ?? 1);
  const q = params.q?.trim();

  const where: Prisma.CustomerWhereInput = {
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

export async function getCustomerDetail(id: string, now = new Date()) {
  const riskDays = env().CRM_RISK_DAYS;
  const customer = await prisma.customer.findUnique({
    where: { id },
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

export async function getStoreOverview(now = new Date()) {
  const riskDays = env().CRM_RISK_DAYS;
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const since90 = new Date(now.getTime() - 90 * DAY_MS);

  const [segmentCounts, rev30, rev90, allTime, topProducts, lastWebhook] = await Promise.all([
    Promise.all(
      SEGMENTS.map(async (s) => ({
        segment: s,
        count: await prisma.customer.count({
          where: { redactedAt: null, ...segmentWhere(s, now, riskDays) },
        }),
      })),
    ),
    prisma.order.aggregate({
      where: { ...revenueOrder, placedAt: { gte: since30 } },
      _sum: { totalPrice: true },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: { ...revenueOrder, placedAt: { gte: since90 } },
      _sum: { totalPrice: true },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: revenueOrder,
      _sum: { totalPrice: true },
      _count: { _all: true },
    }),
    prisma.orderLineItem.groupBy({
      by: ["title"],
      where: { order: { ...revenueOrder, placedAt: { gte: since90 } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
    prisma.webhookEvent.findFirst({
      orderBy: { receivedAt: "desc" },
      select: { receivedAt: true },
    }),
  ]);

  const cents = (d: Prisma.Decimal | null) => (d ? decimalToCents(d) : 0);
  const revenue30 = cents(rev30._sum.totalPrice);
  const allTimeCents = cents(allTime._sum.totalPrice);

  return {
    riskDays,
    segments: segmentCounts,
    customersTotal: segmentCounts.reduce((s, x) => s + x.count, 0),
    revenue30Cents: revenue30,
    orders30: rev30._count._all,
    revenue90Cents: cents(rev90._sum.totalPrice),
    orders90: rev90._count._all,
    avgTicketCents: allTime._count._all ? Math.round(allTimeCents / allTime._count._all) : 0,
    topProducts90: topProducts.map((p) => ({ title: p.title, quantity: p._sum.quantity ?? 0 })),
    lastWebhookAt: lastWebhook?.receivedAt ?? null,
  };
}
