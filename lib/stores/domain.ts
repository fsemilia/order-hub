// Pure helpers for store identifiers (unit-tested, no DB).

const MYSHOPIFY = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/**
 * Normalizes what a user may paste ("https://SitoWeb1.myshopify.com/admin", "sitoweb1") into the
 * canonical "sitoweb1.myshopify.com" sent by Shopify in X-Shopify-Shop-Domain. Returns null if invalid.
 */
export function normalizeShopDomain(input: string): string | null {
  let v = input.trim().toLowerCase();
  v = v.replace(/^https?:\/\//, "").split(/[/?#]/)[0] ?? "";
  if (v && !v.includes(".")) v = `${v}.myshopify.com`;
  return MYSHOPIFY.test(v) ? v : null;
}

export const DEMO_STORE_ID = "demo";

/** Store currencies offered in the UI (amounts are formatted with Intl in the store currency). */
export const CURRENCIES = ["BRL", "USD", "EUR"] as const;
