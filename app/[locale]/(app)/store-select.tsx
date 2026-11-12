"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useI18n } from "@/components/i18n-provider";
import { useHydrated } from "@/components/use-hydrated";
import type { StoreSummary } from "@/lib/stores/stores";
import { switchStore } from "../preferences";

const MANAGE = "__manage__";

export function StoreSelect({ stores, currentId }: { stores: StoreSummary[]; currentId: string }) {
  const { dict } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const demo = stores.filter((s) => s.kind === "DEMO");
  const real = stores.filter((s) => s.kind === "SHOPIFY");

  return (
    <select
      aria-label={dict.storeSwitcher.label}
      // no browser form restoration on reload: the value must come from the server
      autoComplete="off"
      value={currentId}
      disabled={pending || !hydrated}
      data-testid="store-select"
      onChange={(e) => {
        const id = e.target.value;
        if (id === MANAGE) return router.push("/stores");
        startTransition(async () => {
          await switchStore(id);
          router.refresh();
        });
      }}
      className="max-w-52 rounded-md border border-zinc-200 bg-transparent px-2 py-1 text-sm dark:border-zinc-700"
    >
      <optgroup label={dict.storeSwitcher.demoGroup}>
        {demo.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} · {dict.common.demoBadge}
          </option>
        ))}
      </optgroup>
      {real.length > 0 && (
        <optgroup label={dict.storeSwitcher.realGroup}>
          {real.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </optgroup>
      )}
      <option value={MANAGE}>{dict.storeSwitcher.manage}</option>
    </select>
  );
}
