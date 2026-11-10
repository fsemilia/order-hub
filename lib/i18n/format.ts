// Locale- and currency-aware formatting (Intl). Pure: used by server and client components.
import type { Locale } from "./config";

// Dates are shown in the stores' timezone (Brazilian e-commerce). See docs limitation U3.
const TIME_ZONE = "America/Sao_Paulo";

const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat | Intl.RelativeTimeFormat>();
function memo<T extends Intl.NumberFormat | Intl.DateTimeFormat | Intl.RelativeTimeFormat>(
  key: string,
  make: () => T,
): T {
  let f = cache.get(key) as T | undefined;
  if (!f) {
    f = make();
    cache.set(key, f);
  }
  return f;
}

/** Integer cents -> "R$ 1.234,56" / "$1,234.56" / "1.234,56 €". Never floats on stored values. */
export function formatMoney(cents: number, currency: string, locale: Locale): string {
  const f = memo(
    `n:${locale}:${currency}`,
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
      }),
  );
  return f.format(cents / 100);
}

export function formatDate(d: Date | null | undefined, locale: Locale): string {
  if (!d) return "—";
  const f = memo(
    `d:${locale}`,
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: TIME_ZONE,
      }),
  );
  return f.format(d);
}

export function formatDateTime(d: Date | null | undefined, locale: Locale): string {
  if (!d) return "—";
  const f = memo(
    `dt:${locale}`,
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: TIME_ZONE,
      }),
  );
  return f.format(d);
}

export function formatRelativeDays(d: Date | null | undefined, now: Date, locale: Locale): string {
  if (!d) return "—";
  const days = Math.round((d.getTime() - now.getTime()) / 86_400_000);
  const f = memo(`r:${locale}`, () => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }));
  return f.format(days, "day");
}
