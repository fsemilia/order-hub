import { describe, expect, it } from "vitest";
import en from "@/lib/i18n/dictionaries/en";
import itDict from "@/lib/i18n/dictionaries/it";
import ptBR from "@/lib/i18n/dictionaries/pt-BR";
import { isLocale, plural, safePath, splitLocalePrefix, t } from "@/lib/i18n";
import { formatMoney } from "@/lib/i18n/format";

function keys(o: unknown, prefix = ""): string[] {
  if (typeof o !== "object" || o === null || Array.isArray(o)) return [prefix];
  return Object.entries(o).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe("dictionaries", () => {
  it.each([
    ["pt-BR", ptBR],
    ["it", itDict],
  ])("%s has exactly the keys of en", (_, dict) => {
    expect(keys(dict).sort()).toEqual(keys(en).sort());
  });

  it("keeps the same placeholders in every translation", () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    const flat = (o: unknown, p = ""): [string, string][] =>
      typeof o === "string"
        ? [[p, o]]
        : Array.isArray(o)
          ? []
          : Object.entries(o as object).flatMap(([k, v]) => flat(v, `${p}.${k}`));
    const source = new Map(flat(en));
    for (const dict of [ptBR, itDict]) {
      for (const [k, v] of flat(dict)) expect(placeholders(v), k).toBe(placeholders(source.get(k)!));
    }
  });
});

describe("helpers", () => {
  it("interpolates placeholders", () => {
    expect(t("Page {page} of {count}", { page: 2, count: 5 })).toBe("Page 2 of 5");
    expect(t("{missing}")).toBe("{missing}");
  });

  it("selects plural forms per locale", () => {
    expect(plural(en.customers.count, 1, "en")).toBe("1 customer");
    expect(plural(en.customers.count, 0, "en")).toBe("0 customers");
    // CLDR: in Portuguese 0 takes the singular form
    expect(plural(ptBR.customers.count, 0, "pt-BR")).toBe("0 cliente");
    expect(plural(itDict.customers.count, 2, "it")).toBe("2 clienti");
  });

  it("recognizes locales and locale prefixes", () => {
    expect(isLocale("pt-BR")).toBe(true);
    expect(isLocale("pt")).toBe(false);
    expect(splitLocalePrefix("/it/customers")).toEqual({ locale: "it", rest: "/customers" });
    expect(splitLocalePrefix("/pt-BR")).toEqual({ locale: "pt-BR", rest: "/" });
    expect(splitLocalePrefix("/italy")).toBeNull();
  });

  it("never builds a protocol-relative redirect from a locale link", () => {
    expect(safePath(splitLocalePrefix("/en//evil.com")!.rest)).toBe("/");
    expect(safePath(splitLocalePrefix("/it/\\evil.com")!.rest)).toBe("/");
    expect(safePath("/customers")).toBe("/customers");
  });

  it("formats money by locale and store currency", () => {
    expect(formatMoney(123456, "BRL", "pt-BR")).toBe("R$ 1.234,56");
    expect(formatMoney(123456, "USD", "en")).toBe("$1,234.56");
    // Italian CLDR uses minimum grouping 2: no separator for 4-digit amounts
    expect(formatMoney(123456, "EUR", "it")).toBe("1234,56 €");
  });
});
