"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n";
import { requireUser } from "@/lib/session";
import { STORE_COOKIE } from "@/lib/stores/current";
import { DEMO_STORE_ID, getStore, listStores } from "@/lib/stores/stores";

const ONE_YEAR = 60 * 60 * 24 * 365;
const cookieOpts = { path: "/", maxAge: ONE_YEAR, sameSite: "lax" as const, httpOnly: true };

/** UI language. Public on purpose (the login page has a switcher): it only sets a preference. */
export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;
  // Only proxy.ts and the server read it: httpOnly is fine.
  (await cookies()).set(LOCALE_COOKIE, locale, cookieOpts);
}

/** Header store switcher. The id is validated against the DB; requireStoreContext re-checks it. */
export async function switchStore(storeId: string) {
  await requireUser();
  const parsed = z.string().min(1).max(64).safeParse(storeId);
  if (!parsed.success || !(await getStore(parsed.data))) return { ok: false as const };
  (await cookies()).set(STORE_COOKIE, parsed.data, cookieOpts);
  return { ok: true as const };
}

/**
 * Login toggle "Demo data / Real store", applied right after sign-in.
 * Real -> the first connected Shopify store, or the Stores page when none is connected yet.
 */
export async function chooseDataSource(mode: string): Promise<{ redirectTo: string | null }> {
  await requireUser();
  const jar = await cookies();
  if (mode !== "real") {
    jar.set(STORE_COOKIE, DEMO_STORE_ID, cookieOpts);
    return { redirectTo: null };
  }
  const real = (await listStores()).find((s) => s.kind === "SHOPIFY");
  if (!real) return { redirectTo: "/stores" };
  jar.set(STORE_COOKIE, real.id, cookieOpts);
  return { redirectTo: null };
}
