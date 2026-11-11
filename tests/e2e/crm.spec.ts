import { expect, test } from "@playwright/test";

test("dashboard shows KPIs, segments and abandoned carts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Revenue (30 days)")).toBeVisible();
  await expect(page.getByText("Abandoned carts (7 days)")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Segments" })).toBeVisible();
  await expect(page.getByTestId("store-select")).toHaveValue("demo");
});

test("customers can be filtered by segment and opened", async ({ page }) => {
  await page.goto("/customers");
  await page.getByLabel("Segment").selectOption("em_risco");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(/segment=em_risco/);

  const rows = page.locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  for (const badge of await rows.locator("td:nth-child(2)").allInnerTexts()) {
    expect(badge.trim()).toBe("At risk");
  }

  await rows.first().getByRole("link").click();
  await expect(page).toHaveURL(/\/customers\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
});

test("orders page lists orders, filters by status and is reachable from the nav", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Recent orders" })).toBeVisible();
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();

  await page.getByLabel("Status").selectOption("refunded");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(/status=refunded/);
  await expect(page.locator("tbody tr").first()).toBeVisible(); // wait for the streamed table
  const statuses = await page.locator("tbody td:nth-child(4)").allInnerTexts();
  expect(statuses.length).toBeGreaterThan(0);
  for (const s of statuses) expect(s.trim()).toBe("Refunded");
});

test("search narrows the customer list", async ({ page }) => {
  await page.goto("/customers?q=zzzz-nobody");
  await expect(page.getByText("No customers found")).toBeVisible();
});

test("abandoned carts of the demo store are listed", async ({ page }) => {
  await page.goto("/carts");
  await expect(page.getByRole("heading", { name: "Abandoned carts" })).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();
});

test("stores page lists the demo store and the connect form", async ({ page }) => {
  await page.goto("/stores");
  await expect(page.getByTestId("store-demo")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connect a Shopify store" })).toBeVisible();
});

test("a /<locale> link switches language and keeps unprefixed URLs", async ({ page }) => {
  await page.goto("/pt-BR/customers");
  await expect(page).toHaveURL(/\/customers$/);
  await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();

  await page.waitForLoadState("networkidle"); // wait for hydration of the switcher
  await page.getByLabel("Idioma").selectOption("it");
  await expect(page.getByRole("heading", { name: "Clienti" })).toBeVisible();
  // money follows the UI locale, currency follows the store (BRL)
  await expect(page.locator("tbody td").filter({ hasText: "R$" }).first()).toBeVisible();
});

test("agent page renders (configured or not)", async ({ page }) => {
  await page.goto("/agent");
  await expect(page.getByRole("heading", { name: "Retention agent" })).toBeVisible();
});
