import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { createPgAdapter } from "@/lib/db-adapter";

function createClient() {
  // Serverless (Vercel): keep the per-instance pool small; Supabase's pooler multiplexes the rest.
  // Local `prisma dev` (embedded PGlite) is single-connection: set DATABASE_POOL_MAX=1 there.
  const max = Number(process.env.DATABASE_POOL_MAX) || 5;
  const adapter = createPgAdapter(process.env.DATABASE_URL ?? "", max);
  return new PrismaClient({ adapter });
}

// Singleton: in dev, Next.js hot reload would otherwise open a new pool on every reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
