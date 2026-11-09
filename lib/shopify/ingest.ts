import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { recomputeCustomerAggregates } from "@/lib/crm/aggregates";
import { acceptsMarketing, type ShopifyCustomer, type ShopifyOrder } from "./schemas";

export type IngestResult =
  | { status: "upserted"; orderId: string; customerId: string | null }
  | { status: "stale"; orderId: string };

export async function upsertCustomer(tx: Prisma.TransactionClient, c: ShopifyCustomer) {
  // Never resurrect PII of a customer redacted under LGPD/GDPR (customers/redact).
  const redacted = await tx.customer.findFirst({
    where: { shopifyId: c.id, redactedAt: { not: null } },
  });
  if (redacted) return redacted;

  const data = {
    email: c.email ?? null,
    firstName: c.first_name ?? null,
    lastName: c.last_name ?? null,
    phone: c.phone ?? null,
    acceptsMarketing: acceptsMarketing(c),
  };
  return tx.customer.upsert({
    where: { shopifyId: c.id },
    create: { shopifyId: c.id, ...data },
    update: data,
  });
}

/**
 * Idempotent upsert of an order (orders/create, orders/updated, orders/paid, orders/cancelled).
 *
 * - upsert by shopifyId: a retry or an `updated` arriving first never creates duplicates
 * - stale guard: Shopify does not guarantee ordering, so an older `updated_at` is ignored
 * - line items are replaced as a set (orders can be edited)
 * - customer aggregates are recomputed in the same transaction
 */
export async function ingestOrder(
  tx: Prisma.TransactionClient,
  o: ShopifyOrder,
): Promise<IngestResult> {
  const existing = await tx.order.findUnique({
    where: { shopifyId: o.id },
    select: { id: true, shopifyUpdatedAt: true, customerId: true },
  });
  if (existing && existing.shopifyUpdatedAt > o.updated_at) {
    return { status: "stale", orderId: existing.id };
  }

  const customerId = o.customer ? (await upsertCustomer(tx, o.customer)).id : null;

  const data = {
    name: o.name,
    customerId,
    totalPrice: new Prisma.Decimal(o.current_total_price ?? o.total_price),
    currency: o.currency.toUpperCase(),
    financialStatus: o.financial_status ?? "pending",
    fulfillmentStatus: o.fulfillment_status ?? null,
    placedAt: o.created_at,
    cancelledAt: o.cancelled_at ?? null,
    shopifyUpdatedAt: o.updated_at,
  };

  const order = await tx.order.upsert({
    where: { shopifyId: o.id },
    create: { shopifyId: o.id, ...data },
    update: data,
  });

  await tx.orderLineItem.deleteMany({ where: { orderId: order.id } });
  if (o.line_items.length > 0) {
    await tx.orderLineItem.createMany({
      data: o.line_items.map((li) => ({
        orderId: order.id,
        shopifyId: li.id,
        title: li.title,
        sku: li.sku ?? null,
        quantity: li.quantity,
        unitPrice: new Prisma.Decimal(li.price),
      })),
    });
  }

  // The order may have moved between customers (rare, but possible via order edits).
  const affected = new Set([customerId, existing?.customerId].filter((id): id is string => !!id));
  for (const id of affected) await recomputeCustomerAggregates(tx, id);

  return { status: "upserted", orderId: order.id, customerId };
}

/** customers/redact (LGPD/GDPR): wipe PII, keep anonymous order history for revenue metrics. */
export async function redactCustomer(tx: Prisma.TransactionClient, shopifyCustomerId: string) {
  return tx.customer.updateMany({
    where: { shopifyId: shopifyCustomerId },
    data: {
      email: null,
      firstName: null,
      lastName: null,
      phone: null,
      acceptsMarketing: false,
      redactedAt: new Date(),
    },
  });
}
