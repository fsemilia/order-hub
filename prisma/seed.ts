/**
 * Demo data: ~160 Brazilian customers and their orders over the last 12 months.
 *
 * Orders go through the SAME code path as real Shopify webhooks (schema parse + ingestOrder),
 * so the seed also exercises the ingestion pipeline. Deterministic (faker.seed) so screenshots
 * and E2E tests are stable.
 *
 * Run: npm run db:seed   (refuses to run against production)
 */
import "dotenv/config";
import { fakerPT_BR as faker } from "@faker-js/faker";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../generated/prisma/client";
import { shopifyOrderSchema } from "../lib/shopify/schemas";
import { ingestOrder } from "../lib/shopify/ingest";
import { createPgAdapter } from "../lib/db-adapter";

if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
  throw new Error("Refusing to seed a production database.");
}

const prisma = new PrismaClient({
  adapter: createPgAdapter(
    process.env.DATABASE_URL ?? "",
    Number(process.env.DATABASE_POOL_MAX) || 5,
  ),
});

const DAY = 86_400_000;
const NOW = Date.now();

const PRODUCTS = [
  { title: "Sérum Vitamina C 30ml", sku: "SER-VITC-30", price: "119.90" },
  { title: "Hidratante Facial FPS 50", sku: "HID-FPS50", price: "89.90" },
  { title: "Kit Skincare Rotina Completa", sku: "KIT-SKIN", price: "299.00" },
  { title: "Óleo Capilar Argan 60ml", sku: "OLE-ARG-60", price: "64.90" },
  { title: "Shampoo Sólido Natural", sku: "SHA-SOL", price: "39.90" },
  { title: "Máscara de Argila Verde", sku: "MAS-ARG", price: "49.90" },
  { title: "Protetor Labial Manteiga de Cacau", sku: "LAB-CAC", price: "24.90" },
  { title: "Perfume Floral 50ml", sku: "PER-FLO-50", price: "189.00" },
  { title: "Esfoliante Corporal Café", sku: "ESF-CAF", price: "54.90" },
  { title: "Água Micelar 200ml", sku: "AGU-MIC-200", price: "44.90" },
];

type Persona = { kind: "novo" | "recorrente" | "em_risco" | "sem_compras"; orders: number };

function persona(): Persona {
  const r = faker.number.float();
  if (r < 0.28) return { kind: "novo", orders: 1 };
  if (r < 0.55) return { kind: "recorrente", orders: faker.number.int({ min: 2, max: 8 }) };
  if (r < 0.88) return { kind: "em_risco", orders: faker.number.int({ min: 1, max: 5 }) };
  return { kind: "sem_compras", orders: 1 };
}

/** Purchase dates (ms) consistent with the persona, oldest first. */
function orderDates(p: Persona): number[] {
  const daysAgo = (min: number, max: number) => NOW - faker.number.int({ min, max }) * DAY;
  switch (p.kind) {
    case "novo":
    case "sem_compras":
      return [daysAgo(1, 45)];
    case "recorrente": {
      const last = daysAgo(1, 40);
      return [
        last,
        ...Array.from(
          { length: p.orders - 1 },
          () => last - faker.number.int({ min: 10, max: 300 }) * DAY,
        ),
      ].sort();
    }
    case "em_risco": {
      const last = daysAgo(70, 330);
      return [
        last,
        ...Array.from(
          { length: p.orders - 1 },
          () => last - faker.number.int({ min: 15, max: 200 }) * DAY,
        ),
      ].sort();
    }
  }
}

let orderSeq = 1000;

function buildOrderPayload(customer: Record<string, unknown>, placedAt: number, p: Persona) {
  const items = faker.helpers.arrayElements(PRODUCTS, { min: 1, max: 3 }).map((prod) => ({
    id: faker.string.numeric(15),
    title: prod.title,
    sku: prod.sku,
    quantity: faker.number.int({ min: 1, max: 2 }),
    price: prod.price,
  }));
  const totalCents = items.reduce((s, i) => s + Math.round(Number(i.price) * 100) * i.quantity, 0);
  const total = (totalCents / 100).toFixed(2);

  const financial =
    p.kind === "sem_compras"
      ? faker.helpers.arrayElement(["pending", "voided"])
      : faker.helpers.weightedArrayElement([
          { weight: 92, value: "paid" },
          { weight: 5, value: "refunded" },
          { weight: 3, value: "partially_refunded" },
        ]);
  const current =
    financial === "partially_refunded" ? ((totalCents * 0.6) / 100).toFixed(2) : total;
  const created = new Date(placedAt).toISOString();

  return {
    id: faker.string.numeric(16),
    name: `#${++orderSeq}`,
    created_at: created,
    updated_at: new Date(placedAt + 60_000).toISOString(),
    cancelled_at: null,
    currency: "BRL",
    total_price: total,
    current_total_price: current,
    financial_status: financial,
    fulfillment_status: financial === "paid" ? "fulfilled" : null,
    customer,
    line_items: items,
  };
}

async function seedDemoUser() {
  const email = (process.env.DEMO_EMAIL || "demo@orderhub.dev").toLowerCase();
  const password = process.env.DEMO_PASSWORD || "change-me-demo-123";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return email;

  const id = faker.string.alphanumeric(32);
  await prisma.user.create({
    data: {
      id,
      email,
      name: "Usuário Demo",
      emailVerified: true,
      accounts: {
        create: {
          id: faker.string.alphanumeric(32),
          accountId: id,
          providerId: "credential",
          password: await hashPassword(password),
        },
      },
    },
  });
  return email;
}

async function main() {
  faker.seed(42);
  const email = await seedDemoUser();

  await prisma.$transaction([
    prisma.orderLineItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.webhookEvent.deleteMany(),
  ]);

  let orders = 0;
  const CUSTOMERS = 160;
  for (let i = 0; i < CUSTOMERS; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const customer = {
      id: faker.string.numeric(16),
      email: faker.internet.email({ firstName, lastName }).toLowerCase(),
      first_name: firstName,
      last_name: lastName,
      phone: faker.phone.number({ style: "international" }),
      email_marketing_consent: {
        state: faker.datatype.boolean(0.7) ? "subscribed" : "not_subscribed",
      },
    };
    const p = persona();
    for (const placedAt of orderDates(p)) {
      const payload = shopifyOrderSchema.parse(buildOrderPayload(customer, placedAt, p));
      await prisma.$transaction((tx) => ingestOrder(tx, payload));
      orders++;
    }
  }

  console.log(`Seeded ${CUSTOMERS} customers, ${orders} orders. Demo login: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
