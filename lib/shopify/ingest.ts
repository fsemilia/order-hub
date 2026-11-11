import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { recomputeCustomerAggregates } from "@/lib/crm/aggregates";
import {
  acceptsMarketing,
  type ShopifyCheckout,
  type ShopifyCustomer,
  type ShopifyOrder,
} from "./schemas";

export type IngestResult =
  | { status: "upserted"; orderId: string; customerId: string | null }
  | { status: "stale"; orderId: string };

// Every write is scoped to a store: Shopify IDs are only unique within a shop.
const key = (storeId: string, shopifyId: string) => ({ storeId_shopifyId: { storeId, shopifyId } });

export async function upsertCustomer(
  tx: Prisma.TransactionClient,
  storeId: string,
  c: ShopifyCustomer,
  { createOnly = false }: { createOnly?: boolean } = {},
) {
  // Never resurrect PII of a customer redacted under LGPD/GDPR (customers/redact).
  const redacted = await tx.customer.findFirst({
    where: { storeId, shopifyId: c.id, redactedAt: { not: null } },
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
    where: key(storeId, c.id),
    create: { storeId, shopifyId: c.id, ...data },
    // createOnly: the embedded customer of a checkout can be older than a customers/update
    // already processed (no updated_at to compare): never let it overwrite names or consent.
    update: createOnly ? {} : data,
  });
}

/**
 * Idempotent upsert of an order (orders/create, orders/updated, orders/paid, orders/cancelled).
 *
 * - upsert by (storeId, shopifyId): a retry or an `updated` arriving first never creates duplicates
 * - stale guard: Shopify does not guarantee ordering, so an older `updated_at` is ignored
 * - placedAt = processed_at (the business date; differs from created_at for imported orders)
 * - line items are replaced as a set (orders can be edited)
 * - customer aggregates are recomputed in the same transaction
 */
export async function ingestOrder(
  tx: Prisma.TransactionClient,
  storeId: string,
  o: ShopifyOrder,
): Promise<IngestResult> {
  const existing = await tx.order.findUnique({
    where: key(storeId, o.id),
    select: { id: true, shopifyUpdatedAt: true, customerId: true },
  });
  if (existing && existing.shopifyUpdatedAt > o.updated_at) {
    return { status: "stale", orderId: existing.id };
  }

  const customerId = o.customer ? (await upsertCustomer(tx, storeId, o.customer)).id : null;

  const data = {
    name: o.name,
    customerId,
    totalPrice: new Prisma.Decimal(o.current_total_price ?? o.total_price),
    currency: o.currency.toUpperCase(),
    financialStatus: o.financial_status ?? "pending",
    fulfillmentStatus: o.fulfillment_status ?? null,
    placedAt: o.processed_at ?? o.created_at,
    cancelledAt: o.cancelled_at ?? null,
    shopifyUpdatedAt: o.updated_at,
  };

  const order = await tx.order.upsert({
    where: key(storeId, o.id),
    create: { storeId, shopifyId: o.id, ...data },
    update: data,
  });

  // The order completes its checkout: the cart is no longer "abandoned", even if Shopify never
  // sends the checkouts/update with completed_at.
  const checkoutKeys = [o.checkout_token, o.checkout_id].filter((k): k is string => !!k);
  if (checkoutKeys.length > 0) {
    await tx.checkout.updateMany({
      where: { storeId, shopifyId: { in: checkoutKeys }, completedAt: null },
      data: { completedAt: data.placedAt },
    });
  }

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

/**
 * checkouts/create, checkouts/update. A checkout that is never completed is an abandoned cart.
 * Same guarantees as orders: per-store upsert + stale guard.
 */
export async function ingestCheckout(
  tx: Prisma.TransactionClient,
  storeId: string,
  c: ShopifyCheckout,
) {
  const existing = await tx.checkout.findUnique({
    where: key(storeId, c.key),
    select: { id: true, shopifyUpdatedAt: true },
  });
  if (existing && existing.shopifyUpdatedAt > c.updated_at) {
    return { status: "stale" as const, checkoutId: existing.id };
  }

  const customer = c.customer
    ? await upsertCustomer(tx, storeId, c.customer, { createOnly: true })
    : null;
  const items = c.line_items.map((li) => ({
    title: li.title,
    quantity: li.quantity,
    price: li.price,
  }));
  const data = {
    customerId: customer?.id ?? null,
    // LGPD: a redacted customer's email must not come back through a later checkout webhook
    email: customer?.redactedAt ? null : (c.email ?? null),
    totalPrice: new Prisma.Decimal(c.total_price),
    currency: c.currency.toUpperCase(),
    itemsCount: c.line_items.reduce((s, li) => s + li.quantity, 0),
    items,
    abandonedCheckoutUrl: c.abandoned_checkout_url ?? null,
    startedAt: c.created_at,
    completedAt: c.completed_at ?? null,
    shopifyUpdatedAt: c.updated_at,
  };
  const checkout = await tx.checkout.upsert({
    where: key(storeId, c.key),
    create: { storeId, shopifyId: c.key, ...data },
    update: data,
  });
  return { status: "upserted" as const, checkoutId: checkout.id };
}

/** customers/redact (LGPD/GDPR): wipe PII, keep anonymous order history for revenue metrics. */
export async function redactCustomer(
  tx: Prisma.TransactionClient,
  storeId: string,
  { id: shopifyCustomerId, email }: { id: string; email?: string | null },
) {
  const result = await tx.customer.updateMany({
    where: { storeId, shopifyId: shopifyCustomerId },
    data: {
      email: null,
      firstName: null,
      lastName: null,
      phone: null,
      acceptsMarketing: false,
      redactedAt: new Date(),
    },
  });
  // Abandoned checkouts carry the email too: linked ones, and guest ones with the same email
  await tx.checkout.updateMany({
    where: {
      storeId,
      OR: [
        { customer: { shopifyId: shopifyCustomerId } },
        ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
      ],
    },
    data: { email: null },
  });
  return result;
}
