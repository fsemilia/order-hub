import { prisma } from "@/lib/db";

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "order_line_items", "orders", "customers", "webhook_events", "agent_runs" RESTART IDENTITY CASCADE',
  );
}

export { prisma };
