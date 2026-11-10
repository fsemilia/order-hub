"use client";

import { useTransition } from "react";
import { setLocale } from "@/app/[locale]/preferences";
import { LOCALE_NAMES, LOCALES } from "@/lib/i18n/config";
import { cn } from "@/components/ui";
import { useI18n } from "./i18n-provider";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, dict } = useI18n();
  const [pending, startTransition] = useTransition();

  return (
    <label className={cn("flex items-center gap-1.5 text-xs text-zinc-500", className)}>
      <span className="sr-only">{dict.common.language}</span>
      <select
        aria-label={dict.common.language}
        // no browser form restoration on reload: the value must come from the server
        autoComplete="off"
        value={locale}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(async () => {
            await setLocale(next);
            // The locale is the ROOT segment (proxy rewrite, same URL): a soft refresh keeps the
            // old root layout, so reload the document.
            window.location.reload();
          });
        }}
        className="rounded-md border border-zinc-200 bg-transparent px-2 py-1 text-xs dark:border-zinc-700"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
