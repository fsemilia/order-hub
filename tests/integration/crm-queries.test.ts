import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { getStoreOverview, listCustomers } from "@/lib/crm/queries";
import { recomputeCustomerAggregates } from "@/lib/crm/aggregates";
import { prisma, resetDb } from "../support/db";

const NOW = new Date("2026-11-09T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

async function customerWithOrders(
  name: string,
  orders: { daysAgo: number; total: string; status?: string }[],
) {
  const c = await prisma.customer.create({
    data: { shopifyId: randomUUID(), firstName: name, email: `${name}@ex.com` },
  });
  for (const o of orders) {
    await prisma.order.create({
      data: {
        shopifyId: randomUUID(),
        name: "#1",
        customerId: c.id,
        totalPrice: new Prisma.Decimal(o.total),
        currency: "BRL",
        financialStatus: o.status ?? "paid",
        placedAt: daysAgo(o.daysAgo),
        shopifyUpdatedAt: daysAgo(o.daysAgo),
      },
    });
  }
  await prisma.$transaction((tx) => recomputeCustomerAggregates(tx, c.id));
  return c;
}

beforeEach(async () => {
  await resetDb();
  await customerWithOrders("Nova", [{ daysAgo: 3, total: "100.00" }]);
  await customerWithOrders("Fiel", [
    { daysAgo: 50, total: "200.00" },
    { daysAgo: 5, total: "300.00" },
  ]);
  await customerWithOrders("Sumida", [
    { daysAgo: 200, total: "900.00" },
    { daysAgo: 120, total: "100.00" },
  ]);
  await customerWithOrders("Curiosa", [{ daysAgo: 2, total: "50.00", status: "pending" }]);
});

describe("listCustomers", () => {
  it.each([
    ["novo", ["Nova"]],
    ["recorrente", ["Fiel"]],
    ["em_risco", ["Sumida"]],
    ["sem_compras", ["Curiosa"]],
  ] as const)("filters segment %s in SQL", async (segment, names) => {
    const { rows } = await listCustomers({ segment }, NOW);
    expect(rows.map((r) => r.name)).toEqual(names);
  });

  it("orders by LTV and computes average ticket", async () => {
    const { rows } = await listCustomers({}, NOW);
    expect(rows[0]).toMatchObject({
      name: "Sumida",
      ltvCents: 100000,
      avgTicketCents: 50000,
      segment: "em_risco",
    });
  });

  it("searches by name or email, case-insensitive", async () => {
    const { rows } = await listCustomers({ q: "FIEL" }, NOW);
    expect(rows.map((r) => r.name)).toEqual(["Fiel"]);
  });

  it("paginates", async () => {
    const { rows, pageCount } = await listCustomers({ limit: 2, page: 2 }, NOW);
    expect(pageCount).toBe(2);
    expect(rows).toHaveLength(2);
  });
});

describe("getStoreOverview", () => {
  it("aggregates revenue windows and segment counts", async () => {
    const o = await getStoreOverview(NOW);
    expect(o.revenue30Cents).toBe(40000); // Nova 100 + Fiel 300 (pending excluded)
    expect(o.revenue90Cents).toBe(60000);
    expect(Object.fromEntries(o.segments.map((s) => [s.segment, s.count]))).toEqual({
      novo: 1,
      recorrente: 1,
      em_risco: 1,
      sem_compras: 1,
    });
  });
});
