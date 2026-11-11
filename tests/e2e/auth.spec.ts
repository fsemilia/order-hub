import { expect, test } from "@playwright/test";
import { DEMO_EMAIL, DEMO_PASSWORD } from "./constants";

// Logged-out scenarios. Serial: they hit the rate-limited sign-in endpoint.
test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: "serial" });

async function signIn(page: import("@playwright/test").Page, password = DEMO_PASSWORD) {
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("protected pages redirect to login, keeping the destination", async ({ page }) => {
  await page.goto("/customers");
  await expect(page).toHaveURL(/\/login\?next=%2Fcustomers/);
});

test("wrong password shows an error", async ({ page }) => {
  await page.goto("/login");
  await signIn(page, "wrong-password-123");
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
});

test("the login page can switch language before signing in", async ({ page }) => {
  await page.goto("/login");
  // selectOption waits for the switcher to be enabled, i.e. hydrated (components/use-hydrated.ts)
  await page.getByLabel("Language").selectOption("it");
  await expect(page.getByRole("heading", { name: "Accedi alla dashboard" })).toBeVisible();
  await page.getByLabel("Lingua").selectOption("en");
  await expect(page.getByRole("heading", { name: "Sign in to the dashboard" })).toBeVisible();
});

test("choosing 'Real store' at login opens a real store or the Stores page", async ({ page }) => {
  await page.goto("/login");
  // The toggle is disabled until hydration (a click before it would be lost): wait for it.
  await expect(page.getByRole("radio", { name: "Real store" })).toBeEnabled();
  await page.getByText("Real store", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "Real store" })).toBeChecked();
  await signIn(page);
  // With no Shopify store connected (CI) the user lands on /stores to connect one.
  await expect(async () => {
    const onStores = /\/stores$/.test(page.url());
    const current = await page.getByTestId("store-select").inputValue();
    expect(onStores || current !== "demo").toBe(true);
  }).toPass();
});

test("login, then sign out ends the session", async ({ page }) => {
  await page.goto("/login?next=%2Fcustomers");
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
