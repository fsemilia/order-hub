import { expect, test } from "@playwright/test";
import { DEMO_EMAIL, DEMO_PASSWORD } from "./constants";

// Logged-out scenarios. Serial: they hit the rate-limited sign-in endpoint.
test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: "serial" });

test("protected pages redirect to login, keeping the destination", async ({ page }) => {
  await page.goto("/customers");
  await expect(page).toHaveURL(/\/login\?next=%2Fcustomers/);
});

test("wrong password shows an error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(DEMO_EMAIL);
  await page.getByLabel("Senha").fill("wrong-password-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();
});

test("login, then sign out ends the session", async ({ page }) => {
  await page.goto("/login?next=%2Fcustomers");
  await page.getByLabel("E-mail").fill(DEMO_EMAIL);
  await page.getByLabel("Senha").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
