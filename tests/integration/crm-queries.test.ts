import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import {
  getCustomerDetail,
  getStoreOverview,
  listAbandonedCheckouts,
  listCustomers,
} from "@/lib/crm/queries";
import { recomputeCustomerAggregates } from "@/lib/crm/aggregates";
import { createTestStore, prisma, resetDb } from "../support/db";

const NOW = new Date("2026-11-09T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

let storeId: string;
let otherStoreId: string;

async function customerWithOrders(
  name: string,
  orders: { daysAgo: number; total: string; status?: string }[],
  store = storeId,
) {
  const c = await prisma.customer.create({
    data: { storeId: store, shopifyId: randomUUID(), firstName: name, email: `${name}@ex.com` },
  });
  for (const o of orders) {
    await prisma.order.create({
      data: {
        storeId: store,
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
  storeId = (await createTestStore()).id;
  otherStoreId = (await createTestStore("other-shop.myshopify.com")).id;
  // Noise in another store: must never show up in storeId's read models
  await customerWithOrders("Outra", [{ daysAgo: 1, total: "5000.00" }], otherStoreId);
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
    const { rows } = await listCustomers(storeId, { segment }, NOW);
    expect(rows.map((r) => r.name)).toEqual(names);
  });

  it("orders by LTV and computes average ticket", async () => {
    const { rows } = await listCustomers(storeId, {}, NOW);
    expect(rows[0]).toMatchObject({
      name: "Sumida",
      ltvCents: 100000,
      avgTicketCents: 50000,
      segment: "em_risco",
    });
  });

  it("searches by name or email, case-insensitive", async () => {
    const { rows } = await listCustomers(storeId, { q: "FIEL" }, NOW);
    expect(rows.map((r) => r.name)).toEqual(["Fiel"]);
  });

  it("paginates", async () => {
    const { rows, pageCount } = await listCustomers(storeId, { limit: 2, page: 2 }, NOW);
    expect(pageCount).toBe(2);
    expect(rows).toHaveLength(2);
  });
});

describe("getStoreOverview", () => {
  it("aggregates revenue windows and segment counts", async () => {
    const o = await getStoreOverview(storeId, NOW);
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

describe("store isolation", () => {
  it("never returns another store's customer, even by id", async () => {
    const outra = await prisma.customer.findFirstOrThrow({ where: { storeId: otherStoreId } });
    expect(await getCustomerDetail(storeId, outra.id, NOW)).toBeNull();
    expect(await getCustomerDetail(otherStoreId, outra.id, NOW)).not.toBeNull();
    const { rows } = await listCustomers(otherStoreId, {}, NOW);
    expect(rows.map((r) => r.name)).toEqual(["Outra"]);
  });
});

describe("abandoned checkouts", () => {
  async function checkout(store: string, daysAgo_: number, completed: boolean, total: string) {
    await prisma.checkout.create({
      data: {
        storeId: store,
        shopifyId: randomUUID(),
        email: "x@ex.com",
        totalPrice: new Prisma.Decimal(total),
        currency: "BRL",
        itemsCount: 1,
        items: [{ title: "Sérum", quantity: 1, price: total }],
        startedAt: daysAgo(daysAgo_),
        completedAt: completed ? daysAgo(daysAgo_) : null,
        shopifyUpdatedAt: daysAgo(daysAgo_),
      },
    });
  }

  it("lists only uncompleted checkouts of the store and sums the last 7 days", async () => {
    await checkout(storeId, 1, false, "120.00");
    await checkout(storeId, 3, false, "80.50");
    await checkout(storeId, 20, false, "999.00"); // listed, outside the 7-day KPI
    await checkout(storeId, 2, true, "300.00"); // completed: not abandoned
    await checkout(otherStoreId, 1, false, "777.00"); // other store

    const rows = await listAbandonedCheckouts(storeId);
    expect(rows.map((r) => r.totalCents)).toEqual([12000, 8050, 99900]);
    expect(rows[0]?.items).toEqual(["1× Sérum"]);

    const o = await getStoreOverview(storeId, NOW);
    expect(o.abandoned7Count).toBe(2);
    expect(o.abandoned7Cents).toBe(20050);
  });
});
