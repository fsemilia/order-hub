import { cookies } from "next/headers";
import { locale as localeParam } from "next/root-params";
import { DEFAULT_LOCALE, getDictionary, isLocale, LOCALE_COOKIE, type Locale } from "./index";

/**
 * Locale of the current route, from the [locale] root segment. Server Components only
 * (root params are not available in Server Actions / Route Handlers: use getRequestLocale()).
 */
export async function getLocale(): Promise<Locale> {
  const value = await localeParam();
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getI18n() {
  const locale = await getLocale();
  return { locale, dict: getDictionary(locale) };
}

/** Locale for Server Actions: the cookie kept in sync by proxy.ts. */
export async function getRequestLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
