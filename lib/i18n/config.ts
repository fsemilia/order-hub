// Locale configuration. Pure module: safe in proxy, server and client code.

export const LOCALES = ["en", "pt-BR", "it"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Preferred UI language. Set by the language switcher or by visiting /<locale>/... once. */
export const LOCALE_COOKIE = "oh_locale";

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  "pt-BR": "Português",
  it: "Italiano",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** "/it/customers" -> { locale: "it", rest: "/customers" }; null when there is no locale prefix. */
export function splitLocalePrefix(pathname: string): { locale: Locale; rest: string } | null {
  for (const locale of LOCALES) {
    if (pathname === `/${locale}`) return { locale, rest: "/" };
    if (pathname.startsWith(`/${locale}/`)) return { locale, rest: pathname.slice(locale.length + 1) };
  }
  return null;
}

/** A redirect target that stays on this origin: "//evil.com" or "/\\evil.com" collapse to "/". */
export function safePath(path: string): string {
  return /^\/[/\\]/.test(path) ? "/" : path;
}
