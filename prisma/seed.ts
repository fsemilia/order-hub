/**
 * Demo data: ~160 Brazilian customers and their orders over the last 12 months.
 *
 * Orders go through the SAME code path as real Shopify webhooks (schema parse + ingestOrder),
 * so the seed also exercises the ingestion pipeline. Deterministic (faker.seed) so screenshots
 * and E2E tests are stable.
 *
 * Everything lives in the DEMO store (id "demo"): real Shopify stores are never touched.
 *
 * Run: npm run db:seed   (refuses to run against production)
 */
import "dotenv/config";
import { fakerPT_BR as faker } from "@faker-js/faker";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../generated/prisma/client";
import { shopifyCheckoutSchema, shopifyOrderSchema } from "../lib/shopify/schemas";
import { ingestCheckout, ingestOrder } from "../lib/shopify/ingest";
import { DEMO_STORE_ID } from "../lib/stores/domain";
import { createPgAdapter } from "../lib/db-adapter";
import { encryptSecret } from "../lib/crypto";

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

function buildCheckoutPayload(customer: Record<string, unknown>) {
  const startedAt = NOW - faker.number.int({ min: 1, max: 14 * 24 }) * 3_600_000;
  const items = faker.helpers.arrayElements(PRODUCTS, { min: 1, max: 3 }).map((prod) => ({
    title: prod.title,
    quantity: faker.number.int({ min: 1, max: 2 }),
    price: prod.price,
  }));
  const totalCents = items.reduce((s, i) => s + Math.round(Number(i.price) * 100) * i.quantity, 0);
  const token = faker.string.alphanumeric(32);
  return {
    token,
    email: customer.email,
    total_price: (totalCents / 100).toFixed(2),
    currency: "BRL",
    created_at: new Date(startedAt).toISOString(),
    updated_at: new Date(startedAt + 120_000).toISOString(),
    completed_at: null,
    abandoned_checkout_url: `https://demo.myshopify.com/checkouts/${token}/recover`,
    customer,
    line_items: items,
  };
}

/**
 * Local dev convenience: an (empty) SHOPIFY store matching LOCAL_SHOP_DOMAIN/LOCAL_WEBHOOK_SECRET,
 * so `npm run webhook:send` works out of the box. Skipped when the variables are missing.
 */
async function seedLocalShopifyStore() {
  const shopDomain = process.env.LOCAL_SHOP_DOMAIN;
  const secret = process.env.LOCAL_WEBHOOK_SECRET;
  const key = process.env.STORE_SECRETS_KEY;
  if (!shopDomain || !secret || !key) return;
  const webhookSecretEnc = encryptSecret(secret, key);
  await prisma.store.upsert({
    where: { shopDomain },
    create: {
      name: "Local dev store",
      kind: "SHOPIFY",
      shopDomain,
      currency: "BRL",
      webhookSecretEnc,
    },
    update: { webhookSecretEnc },
  });
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

  // Reset ONLY the demo store (cascade removes its customers, orders, checkouts, events).
  await prisma.store.deleteMany({ where: { id: DEMO_STORE_ID } });
  await prisma.store.create({
    data: { id: DEMO_STORE_ID, name: "Demo store", kind: "DEMO", currency: "BRL" },
  });

  let orders = 0;
  let checkouts = 0;
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
      await prisma.$transaction((tx) => ingestOrder(tx, DEMO_STORE_ID, payload));
      orders++;
    }
    // ~15% of customers also left a cart behind in the last 2 weeks
    if (faker.datatype.boolean(0.15)) {
      const payload = shopifyCheckoutSchema.parse(buildCheckoutPayload(customer));
      await prisma.$transaction((tx) => ingestCheckout(tx, DEMO_STORE_ID, payload));
      checkouts++;
    }
  }

  await seedLocalShopifyStore();

  console.log(
    `Seeded ${CUSTOMERS} customers, ${orders} orders, ${checkouts} abandoned checkouts. Demo login: ${email}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
