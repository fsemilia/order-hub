// Money helpers. Rule of the codebase: no floating point arithmetic on money.
// Shopify sends prices as decimal strings ("129.90"): they go straight into Prisma.Decimal,
// and anything computed in JS is done in integer cents.

/** "129.90" -> 12990, without going through a float. Throws on malformed input. */
export function priceToCents(price: string): number {
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(price.trim());
  if (!match) throw new Error(`Invalid price: "${price}"`);
  const [, sign, int, dec = ""] = match;
  const cents = Number(int) * 100 + Number(dec.padEnd(2, "0").slice(0, 2));
  return sign ? -cents : cents;
}

/** 12990 -> "129.90" (integer arithmetic, no float), for APIs that take decimal strings. */
export function centsToPrice(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error(`Cents must be an integer: ${cents}`);
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Accepts anything with a toString() that yields a decimal string (e.g. Prisma.Decimal). */
export function decimalToCents(value: { toString(): string } | string | number): number {
  return priceToCents(typeof value === "number" ? value.toFixed(2) : value.toString());
}

// Display formatting (locale + store currency) lives in lib/i18n/format.ts (formatMoney).
