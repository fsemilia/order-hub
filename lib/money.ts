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

/** Accepts anything with a toString() that yields a decimal string (e.g. Prisma.Decimal). */
export function decimalToCents(value: { toString(): string } | string | number): number {
  return priceToCents(typeof value === "number" ? value.toFixed(2) : value.toString());
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatCents(cents: number, currency = "BRL"): string {
  const formatter =
    currency === "BRL" ? brl : new Intl.NumberFormat("pt-BR", { style: "currency", currency });
  return formatter.format(cents / 100);
}
