import { prisma } from "@/lib/db";
import { createShopifyStore } from "@/lib/stores/stores";

export async function resetDb() {
  // Stores cascade to customers, orders, line items, checkouts and webhook events.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "stores", "order_line_items", "orders", "customers", "checkouts", "webhook_events", "agent_runs" RESTART IDENTITY CASCADE',
  );
}

export const TEST_SHOP = "order-hub-dev.myshopify.com";
export const TEST_SECRET = "test_webhook_secret";

/** A Shopify store whose webhook secret is stored encrypted, exactly like production. */
export function createTestStore(shopDomain = TEST_SHOP, webhookSecret = TEST_SECRET) {
  return createShopifyStore({ name: shopDomain, shopDomain, currency: "BRL", webhookSecret });
}

export { prisma };
