import { expect, test as setup } from "@playwright/test";
import { DEMO_EMAIL, DEMO_PASSWORD, STORAGE_STATE } from "./constants";

// Log in ONCE and reuse the session in every test: the sign-in endpoint is rate limited
// (that's a feature), so logging in per test would trip it. English is the default UI language.
setup("authenticate as demo user", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.context().storageState({ path: STORAGE_STATE });
});
