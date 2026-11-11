import { expect, test as setup } from "@playwright/test";
import { DEMO_EMAIL, DEMO_PASSWORD, STORAGE_STATE } from "./constants";

// Log in ONCE and reuse the session in every test: the sign-in endpoint is rate limited
// (that's a feature), so logging in per test would trip it. English is the default UI language.
setup("authenticate as demo user", async ({ page }) => {
  // Includes the cold compile of every route on a fresh `next dev` (see the warm-up below).
  setup.setTimeout(120_000);
  // A fresh `next dev` may reload /login a few times while it compiles it, interrupting the
  // sign-in: retry the whole flow. Each attempt starts signed out (a previous attempt may have
  // signed in, and /login then redirects to /). A rejected sign-in (wrong password, 429) is not
  // retried: it fails right away with the form's own message.
  const overview = page.getByRole("heading", { name: "Overview" });
  // Scoped to the form: Next.js adds its own role="alert" route announcer to every page.
  const signInError = page.locator("form").getByRole("alert");
  let rejected = "";
  await expect(async () => {
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email").fill(DEMO_EMAIL);
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(overview.or(signInError)).toBeVisible();
    if (await signInError.isVisible()) rejected = await signInError.innerText();
  }).toPass({ intervals: [1_000, 5_000], timeout: 60_000 });
  expect(rejected, "the demo sign-in was rejected").toBe("");
  await expect(overview).toBeVisible();
  await page.context().storageState({ path: STORAGE_STATE });

  // Locally Playwright starts a fresh `next dev`, which compiles each route on its first request.
  // Visit every page once, sequentially, before the parallel tests hit them all at the same time
  // (which made multi-step tests time out). Against the production build (CI) this takes ~1 s.
  for (const path of ["/orders", "/customers", "/carts", "/agent", "/stores"]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
  }
});
