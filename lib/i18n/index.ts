// Dictionaries + tiny message helpers. Pure: usable on the server, in the client provider and in tests.
import { DEFAULT_LOCALE, type Locale } from "./config";
import en, { type Dictionary } from "./dictionaries/en";
import it from "./dictionaries/it";
import ptBR from "./dictionaries/pt-BR";

export type { Dictionary };
export * from "./config";

const DICTIONARIES: Record<Locale, Dictionary> = { en, "pt-BR": ptBR, it };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

type Vars = Record<string, string | number>;

/** "Page {page} of {count}" + { page: 2, count: 5 } -> "Page 2 of 5". Unknown placeholders stay. */
export function t(template: string, vars: Vars = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export type PluralForms = { one: string; other: string };

/** Picks the CLDR plural form for `count` in `locale`, then interpolates {count} (+ extra vars). */
export function plural(forms: PluralForms, count: number, locale: Locale, vars: Vars = {}): string {
  const form = new Intl.PluralRules(locale).select(count) === "one" ? forms.one : forms.other;
  return t(form, { count, ...vars });
}
