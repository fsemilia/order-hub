import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { REVENUE_STATUSES } from "./segments";

/**
 * Recomputes a customer's denormalized aggregates from their orders.
 *
 * Always recomputed from scratch (never incremented): this makes it idempotent and correct
 * for retries, out-of-order webhooks, refunds (current_total_price) and cancellations.
 * Must run inside the same transaction that wrote the order.
 */
export async function recomputeCustomerAggregates(
  tx: Prisma.TransactionClient,
  customerId: string,
) {
  const agg = await tx.order.aggregate({
    where: {
      customerId,
      financialStatus: { in: [...REVENUE_STATUSES] },
      cancelledAt: null,
    },
    _count: { _all: true },
    _sum: { totalPrice: true },
    _min: { placedAt: true },
    _max: { placedAt: true },
  });

  return tx.customer.update({
    where: { id: customerId },
    data: {
      ordersCount: agg._count._all,
      totalSpent: agg._sum.totalPrice ?? new Prisma.Decimal(0),
      firstOrderAt: agg._min.placedAt,
      lastOrderAt: agg._max.placedAt,
    },
  });
}
