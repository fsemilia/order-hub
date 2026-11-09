import { expect, test } from "@playwright/test";

test("dashboard shows KPIs and segments", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Faturamento (30 dias)")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Segmentos" })).toBeVisible();
});

test("customers can be filtered by segment and opened", async ({ page }) => {
  await page.goto("/customers");
  await page.getByLabel("Segmento").selectOption("em_risco");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(/segment=em_risco/);

  const rows = page.locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  for (const badge of await rows.locator("td:nth-child(2)").allInnerTexts()) {
    expect(badge.trim()).toBe("Em risco");
  }

  await rows.first().getByRole("link").click();
  await expect(page).toHaveURL(/\/customers\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: "Pedidos" })).toBeVisible();
});

test("search narrows the customer list", async ({ page }) => {
  await page.goto("/customers?q=zzzz-nobody");
  await expect(page.getByText("Nenhum cliente encontrado")).toBeVisible();
});

test("agent page renders (configured or not)", async ({ page }) => {
  await page.goto("/agent");
  await expect(page.getByRole("heading", { name: "Agente de retenção" })).toBeVisible();
});
