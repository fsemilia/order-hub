import "server-only";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/session";
import { DEMO_STORE_ID, getStore, type StoreSummary } from "./stores";

export const STORE_COOKIE = "oh_store";

/**
 * The store the user is looking at, from the `oh_store` cookie (set by the store switcher or by the
 * demo/real choice at login). The cookie is only a preference: the id is re-validated against the
 * database on every request, and an unknown id falls back to the demo store.
 */
export async function getCurrentStore(): Promise<StoreSummary> {
  const id = (await cookies()).get(STORE_COOKIE)?.value;
  const store = (id && (await getStore(id))) || (await getStore(DEMO_STORE_ID));
  if (!store) throw new Error("Demo store missing: run the migrations");
  return store;
}

/** Authenticated user + current store: the entry point for every store-scoped page and action. */
export async function requireStoreContext() {
  const user = await requireUser();
  const store = await getCurrentStore();
  return { user, store };
}
