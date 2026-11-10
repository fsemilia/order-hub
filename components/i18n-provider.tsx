"use client";

import { createContext, useContext } from "react";
import type { Dictionary, Locale } from "@/lib/i18n";

const I18nContext = createContext<{ locale: Locale; dict: Dictionary } | null>(null);

/** Gives Client Components the dictionary of the current locale (passed from the root layout). */
export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  children: React.ReactNode;
}) {
  return <I18nContext value={{ locale, dict }}>{children}</I18nContext>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
