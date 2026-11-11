/**
 * Populates a REAL Shopify development store with test data, so that its webhooks feed Order Hub:
 * products (published to the Online Store), customers, and backdated orders paid with TEST
 * transactions (some refunded, partially refunded, pending or cancelled).
 *
 *   npm run shopify:populate -- --store sitoweb1.myshopify.com [--customers 25] [--orders 40]
 *
 * Prerequisites (see docs/en/shopify-setup.md):
 *   shopify store auth --store sitoweb1.myshopify.com \
 *     --scopes write_products,write_customers,write_orders,read_publications,write_publications
 *
 * Safe to re-run: everything is tagged "order-hub-demo"; products and customers that already exist
 * are reused (orders are always new). Customer emails use @example.com: nobody receives anything,
 * and receipts are not sent (sendReceipt: false).
 *
 * Development/trial stores accept at most 5 new orders per minute: the script paces itself.
 */
import { fakerPT_BR as faker } from "@faker-js/faker";
import { parseArgs } from "node:util";
import { centsToPrice, priceToCents } from "../../lib/money";
import { normalizeShopDomain } from "../../lib/stores/domain";
import { assertNoUserErrors, createAdmin, sleep, type Admin } from "./admin";

const TAG = "order-hub-demo";
const ONLINE_STORE_NAMES =
  /^(online store|negozio online|loja virtual|tienda online|boutique en ligne|onlineshop|online-shop)$/i;
const DAY = 86_400_000;

const { values } = parseArgs({
  options: {
    store: { type: "string" },
    customers: { type: "string", default: "25" },
    orders: { type: "string", default: "40" },
  },
});

const store = normalizeShopDomain(values.store ?? "");
if (!store) throw new Error("Pass --store <shop>.myshopify.com");

// Same catalog as the demo seed (prices in the shop currency)
const PRODUCTS = [
  { title: "Sérum Vitamina C 30ml", sku: "SER-VITC-30", price: "119.90" },
  { title: "Hidratante Facial FPS 50", sku: "HID-FPS50", price: "89.90" },
  { title: "Kit Skincare Rotina Completa", sku: "KIT-SKIN", price: "299.00" },
  { title: "Óleo Capilar Argan 60ml", sku: "OLE-ARG-60", price: "64.90" },
  { title: "Shampoo Sólido Natural", sku: "SHA-SOL", price: "39.90" },
  { title: "Máscara de Argila Verde", sku: "MAS-ARG", price: "49.90" },
  { title: "Perfume Floral 50ml", sku: "PER-FLO-50", price: "189.00" },
  { title: "Água Micelar 200ml", sku: "AGU-MIC-200", price: "44.90" },
];

type Variant = { id: string; price: string; title: string };

async function ensureProducts(admin: Admin): Promise<Variant[]> {
  const existing = admin.execute<{
    products: {
      nodes: {
        id: string;
        title: string;
        variants: { nodes: { id: string; price: string }[] };
      }[];
    };
  }>(
    `query($q: String!) { products(first: 50, query: $q) {
       nodes { id title variants(first: 1) { nodes { id price } } } } }`,
    { q: `tag:${TAG}` },
  ).products.nodes;

  const onlineStore = admin
    .execute<{ publications: { nodes: { id: string; name: string }[] } }>(
      `{ publications(first: 20) { nodes { id name } } }`,
    )
    // The name follows the admin language ("Online Store", "Negozio online", "Loja virtual"…)
    .publications.nodes.find((p) => ONLINE_STORE_NAMES.test(p.name));

  // Idempotent: publishing an already published product changes nothing.
  const publish = (productId: string, title: string) => {
    if (!onlineStore) return;
    const pub = admin.execute<{
      publishablePublish: { userErrors: { field: string[] | null; message: string }[] };
    }>(
      `mutation($id: ID!, $input: [PublicationInput!]!) {
         publishablePublish(id: $id, input: $input) { userErrors { field message } } }`,
      { id: productId, input: [{ publicationId: onlineStore.id }] },
      { mutation: true },
    );
    assertNoUserErrors(`publish ${title}`, pub.publishablePublish.userErrors);
  };

  const variants: Variant[] = [];
  for (const p of PRODUCTS) {
    const found = existing.find((e) => e.title === p.title);
    const variant = found?.variants.nodes[0];
    if (found && variant) {
      publish(found.id, p.title); // earlier runs may have created it without publishing
      variants.push({ id: variant.id, price: variant.price, title: p.title });
      continue;
    }
    const res = admin.execute<{
      productSet: {
        product: { id: string; variants: { nodes: { id: string; price: string }[] } } | null;
        userErrors: { field: string[] | null; message: string }[];
      };
    }>(
      `mutation($input: ProductSetInput!) {
         productSet(input: $input, synchronous: true) {
           product { id variants(first: 1) { nodes { id price } } }
           userErrors { field message } } }`,
      {
        input: {
          title: p.title,
          status: "ACTIVE",
          vendor: "Order Hub Demo",
          tags: [TAG],
          productOptions: [{ name: "Title", values: [{ name: "Default Title" }] }],
          variants: [
            {
              optionValues: [{ optionName: "Title", name: "Default Title" }],
              price: p.price,
              sku: p.sku,
              inventoryPolicy: "CONTINUE", // never out of stock: orders and carts always work
            },
          ],
        },
      },
      { mutation: true },
    );
    assertNoUserErrors(`productSet ${p.title}`, res.productSet.userErrors);
    const product = res.productSet.product!;
    publish(product.id, p.title);
    variants.push({ id: product.variants.nodes[0]!.id, price: p.price, title: p.title });
    console.log(`  + product ${p.title}`);
  }
  if (!onlineStore) console.warn("  ! Online Store publication not found: products not published");
  return variants;
}

type Customer = { id: string; email: string };

async function ensureCustomers(admin: Admin, count: number): Promise<Customer[]> {
  const out: Customer[] = [];
  for (let i = 0; i < count; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = faker.internet
      .email({ firstName, lastName, provider: "example.com" })
      .toLowerCase();

    const found = admin.execute<{ customers: { nodes: { id: string }[] } }>(
      `query($q: String!) { customers(first: 1, query: $q) { nodes { id } } }`,
      { q: `email:${email}` },
    ).customers.nodes[0];
    if (found) {
      out.push({ id: found.id, email });
      continue;
    }
    const res = admin.execute<{
      customerCreate: {
        customer: { id: string } | null;
        userErrors: { field: string[] | null; message: string }[];
      };
    }>(
      `mutation($input: CustomerInput!) {
         customerCreate(input: $input) { customer { id } userErrors { field message } } }`,
      {
        input: {
          firstName,
          lastName,
          email,
          tags: [TAG],
          emailMarketingConsent: faker.datatype.boolean(0.7)
            ? { marketingState: "SUBSCRIBED", marketingOptInLevel: "SINGLE_OPT_IN" }
            : { marketingState: "UNSUBSCRIBED" },
        },
      },
      { mutation: true },
    );
    assertNoUserErrors(`customerCreate ${email}`, res.customerCreate.userErrors);
    out.push({ id: res.customerCreate.customer!.id, email });
    console.log(`  + customer ${firstName} ${lastName}`);
  }
  return out;
}

/** Spreads purchases so that every CRM segment shows up (new, returning, at risk, no purchases). */
function orderPlan(customers: Customer[], total: number) {
  const plan: { customer: Customer; daysAgo: number }[] = [];
  customers.forEach((customer, i) => {
    const kind = i % 4; // 0 new, 1 returning, 2 at risk, 3 at risk (older)
    if (kind === 0) plan.push({ customer, daysAgo: faker.number.int({ min: 1, max: 30 }) });
    if (kind === 1) {
      plan.push({ customer, daysAgo: faker.number.int({ min: 1, max: 25 }) });
      plan.push({ customer, daysAgo: faker.number.int({ min: 40, max: 200 }) });
    }
    if (kind >= 2) plan.push({ customer, daysAgo: faker.number.int({ min: 75, max: 300 }) });
  });
  while (plan.length < total) {
    plan.push({
      customer: faker.helpers.arrayElement(customers),
      daysAgo: faker.number.int({ min: 1, max: 300 }),
    });
  }
  return plan.slice(0, total);
}

async function createOrders(
  admin: Admin,
  customers: Customer[],
  variants: Variant[],
  total: number,
  currency: string,
) {
  const plan = orderPlan(customers, total);
  let created = 0;
  for (const { customer, daysAgo } of plan) {
    const items = faker.helpers.arrayElements(variants, { min: 1, max: 3 }).map((v) => ({
      variant: v,
      quantity: faker.number.int({ min: 1, max: 2 }),
    }));
    const amount = centsToPrice(
      items.reduce((s, i) => s + priceToCents(String(i.variant.price)) * i.quantity, 0),
    );
    const processedAt = new Date(
      Date.now() - daysAgo * DAY - faker.number.int({ min: 0, max: DAY }),
    ).toISOString();
    const status = faker.helpers.weightedArrayElement([
      { weight: 80, value: "PAID" },
      { weight: 7, value: "PENDING" },
      { weight: 7, value: "REFUNDED" },
      { weight: 6, value: "PARTIALLY_REFUNDED" },
    ]);

    const order = {
      currency,
      processedAt,
      test: true,
      tags: [TAG],
      email: customer.email,
      customer: { toAssociate: { id: customer.id } },
      financialStatus: status,
      lineItems: items.map((i) => ({ variantId: i.variant.id, quantity: i.quantity })),
      ...(status === "PENDING"
        ? {}
        : {
            transactions: [
              {
                kind: "SALE",
                status: "SUCCESS",
                gateway: "manual",
                test: true,
                processedAt,
                amountSet: { shopMoney: { amount, currencyCode: currency } },
              },
            ],
          }),
    };

    const res = await withRetry(() =>
      admin.execute<{
        orderCreate: {
          order: { id: string; name: string } | null;
          userErrors: { field: string[] | null; message: string }[];
        };
      }>(
        `mutation($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
           orderCreate(order: $order, options: $options) {
             order { id name } userErrors { field message } } }`,
        { order, options: { sendReceipt: false, sendFulfillmentReceipt: false } },
        { mutation: true },
      ),
    );
    assertNoUserErrors("orderCreate", res.orderCreate.userErrors);
    const created_ = res.orderCreate.order!;
    created++;
    console.log(`  + order ${created_.name} ${status} ${amount} ${currency} (${daysAgo}d ago)`);

    // ~8% of paid orders are cancelled afterwards (orders/cancelled webhook)
    if (status === "PAID" && faker.datatype.boolean(0.08)) {
      const c = admin.execute<{
        orderCancel: { orderCancelUserErrors: { field: string[] | null; message: string }[] };
      }>(
        `mutation($orderId: ID!) {
           orderCancel(orderId: $orderId, reason: CUSTOMER, restock: true, notifyCustomer: false,
             refundMethod: { originalPaymentMethodsRefund: true }) {
             orderCancelUserErrors { field message } } }`,
        { orderId: created_.id },
        { mutation: true },
      );
      assertNoUserErrors("orderCancel", c.orderCancel.orderCancelUserErrors);
      console.log(`    ↳ cancelled ${created_.name}`);
    }

    // Development stores: max 5 orders/minute
    if (created < plan.length) await sleep(12_500);
  }
  return created;
}

async function withRetry<T>(fn: () => T, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return fn();
    } catch (e) {
      if (i >= attempts || !/throttl|rate|limit/i.test(String(e))) throw e;
      console.warn(`  … throttled, retrying in 60s (${i}/${attempts - 1})`);
      await sleep(60_000);
    }
  }
}

async function main() {
  faker.seed(2026);
  const admin = createAdmin(store!);
  try {
    const shop = admin.execute<{ shop: { name: string; currencyCode: string } }>(
      `{ shop { name currencyCode } }`,
    ).shop;
    console.log(`Store: ${shop.name} (${store}, ${shop.currencyCode})`);
    console.log(
      `  (Order Hub formats amounts in the currency set on the Stores page: make it ${shop.currencyCode})`,
    );

    console.log("Products…");
    const variants = await ensureProducts(admin);
    console.log("Customers…");
    const customers = await ensureCustomers(admin, Number(values.customers));
    const total = Number(values.orders);
    console.log(`Orders… (${total}, ~${Math.ceil((total * 12.5) / 60)} min: dev-store rate limit)`);
    const created = await createOrders(admin, customers, variants, total, shop.currencyCode);

    console.log(
      `\nDone: ${variants.length} products, ${customers.length} customers, ${created} orders.` +
        `\nAbandoned carts need the storefront: npm run shopify:abandon -- --store ${store}`,
    );
  } finally {
    admin.dispose();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
