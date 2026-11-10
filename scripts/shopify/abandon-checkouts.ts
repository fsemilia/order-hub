/**
 * Creates ABANDONED CHECKOUTS on a real Shopify development store through its storefront
 * (the Admin API has no mutation for them): opens a cart permalink with the email pre-filled,
 * waits for the checkout to load, then leaves. Shopify then sends checkouts/create to Order Hub.
 *
 *   SHOPIFY_STOREFRONT_PASSWORD=... npm run shopify:abandon -- --store sitoweb1.myshopify.com [--count 6]
 *
 * - The storefront password (Online Store → Preferences) is read from the environment, never
 *   from argv, so it does not end up in shell history.
 * - Uses the products created by `npm run shopify:populate` (tag order-hub-demo) and the
 *   customers' @example.com emails, so carts link to existing customers.
 * - Best effort: it drives Shopify's real checkout UI, which can change. See limitation D5.
 */
import { chromium } from "@playwright/test";
import { fakerPT_BR as faker } from "@faker-js/faker";
import { parseArgs } from "node:util";
import { normalizeShopDomain } from "../../lib/stores/domain";
import { createAdmin, sleep } from "./admin";

const TAG = "order-hub-demo";

const { values } = parseArgs({
  options: {
    store: { type: "string" },
    count: { type: "string", default: "6" },
    headed: { type: "boolean", default: false },
  },
});

const store = normalizeShopDomain(values.store ?? "");
if (!store) throw new Error("Pass --store <shop>.myshopify.com");
const password = process.env.SHOPIFY_STOREFRONT_PASSWORD ?? "";

async function main() {
  faker.seed(Date.now() % 100_000);
  const admin = createAdmin(store!);
  let variants: string[];
  let emails: string[];
  try {
    variants = admin
      .execute<{ products: { nodes: { variants: { nodes: { id: string }[] } }[] } }>(
        `query($q: String!) { products(first: 20, query: $q) {
           nodes { variants(first: 1) { nodes { id } } } } }`,
        { q: `tag:${TAG}` },
      )
      .products.nodes.flatMap((p) => p.variants.nodes.map((v) => v.id.split("/").pop()!));
    emails = admin
      .execute<{ customers: { nodes: { email: string | null }[] } }>(
        `query($q: String!) { customers(first: 50, query: $q) { nodes { email } } }`,
        { q: `tag:${TAG}` },
      )
      .customers.nodes.flatMap((c) => (c.email ? [c.email] : []));
  } finally {
    admin.dispose();
  }
  if (variants.length === 0)
    throw new Error("No order-hub-demo products: run shopify:populate first");

  const browser = await chromium.launch({ headless: !values.headed });
  const base = `https://${store}`;
  let done = 0;
  try {
    for (let i = 0; i < Number(values.count); i++) {
      const context = await browser.newContext({ locale: "pt-BR" });
      const page = await context.newPage();
      try {
        if (password) {
          await page.goto(`${base}/password`);
          const field = page.locator('input[type="password"]').first();
          if (await field.isVisible().catch(() => false)) {
            await field.fill(password);
            await field.press("Enter");
            await page.waitForLoadState("networkidle");
          }
        }
        const items = faker.helpers
          .arrayElements(variants, { min: 1, max: 3 })
          .map((id) => `${id}:${faker.number.int({ min: 1, max: 2 })}`)
          .join(",");
        // ~1 in 5 carts is a guest with an email that is not a customer yet
        const email =
          emails.length > 0 && faker.datatype.boolean(0.8)
            ? faker.helpers.arrayElement(emails)
            : faker.internet.email({ provider: "example.com" }).toLowerCase();
        const url = `${base}/cart/${items}?checkout[email]=${encodeURIComponent(email)}`;
        await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });

        if (!/\/checkouts?\//.test(page.url())) {
          console.warn(`  ! did not reach checkout (${page.url()}): storefront password?`);
          continue;
        }
        // Make sure the contact email is set even if the prefill parameter is ignored
        const emailInput = page.locator('input[name="email"], input#email').first();
        if (await emailInput.isVisible().catch(() => false)) {
          if (!(await emailInput.inputValue())) await emailInput.fill(email);
          await emailInput.blur();
        }
        await sleep(4_000); // let the checkout save, then abandon it
        done++;
        console.log(`  + abandoned checkout for ${email} (${items})`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log(
    `\nDone: ${done} abandoned checkouts. Shopify sends checkouts/create within minutes.`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
