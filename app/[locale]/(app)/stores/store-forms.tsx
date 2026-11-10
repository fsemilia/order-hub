"use client";

import { useRouter } from "next/navigation";
import { useActionState, useTransition } from "react";
import { useI18n } from "@/components/i18n-provider";
import { buttonStyles, cn, inputStyles } from "@/components/ui";
import { t } from "@/lib/i18n";
import { CURRENCIES } from "@/lib/stores/domain";
import { switchStore } from "../../preferences";
import { addStore, removeStore, rotateSecret, type StoreFormState } from "./actions";

function Feedback({ state }: { state: StoreFormState }) {
  if (!state) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={cn("text-sm", state.ok ? "text-emerald-600" : "text-red-600")}
    >
      {state.message}
    </p>
  );
}

const invalid = "border-red-400 focus:border-red-500 focus:ring-red-500/20";

export function AddStoreForm() {
  const { locale, dict } = useI18n();
  const s = dict.stores;
  const [state, action, pending] = useActionState<StoreFormState, FormData>(addStore, null);
  const bad = (f: "name" | "domain" | "secret") => state && !state.ok && state.fields?.[f];

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="locale" value={locale} />
      <div>
        <label htmlFor="name" className="mb-1 block text-xs font-medium text-zinc-500">
          {s.name}
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={80}
          placeholder={s.namePlaceholder}
          className={cn(inputStyles, bad("name") && invalid)}
        />
      </div>
      <div>
        <label htmlFor="domain" className="mb-1 block text-xs font-medium text-zinc-500">
          {s.domain}
        </label>
        <input
          id="domain"
          name="domain"
          required
          placeholder={s.domainPlaceholder}
          className={cn(inputStyles, bad("domain") && invalid)}
        />
      </div>
      <div>
        <label htmlFor="currency" className="mb-1 block text-xs font-medium text-zinc-500">
          {s.currency}
        </label>
        <select id="currency" name="currency" defaultValue="BRL" className={inputStyles}>
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="secret" className="mb-1 block text-xs font-medium text-zinc-500">
          {s.secret}
        </label>
        <input
          id="secret"
          name="secret"
          type="password"
          required
          autoComplete="off"
          minLength={16}
          className={cn(inputStyles, bad("secret") && invalid)}
        />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={buttonStyles.primary}>
          {s.add}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function RotateSecretForm({ storeId }: { storeId: string }) {
  const { locale, dict } = useI18n();
  const s = dict.stores;
  const [state, action, pending] = useActionState<StoreFormState, FormData>(rotateSecret, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="storeId" value={storeId} />
      <label htmlFor={`secret-${storeId}`} className="block text-xs font-medium text-zinc-500">
        {s.rotate}
      </label>
      <div className="flex gap-2">
        <input
          id={`secret-${storeId}`}
          name="secret"
          type="password"
          required
          minLength={16}
          autoComplete="off"
          placeholder={s.rotateHint}
          className={inputStyles}
        />
        <button type="submit" disabled={pending} className={buttonStyles.secondary}>
          {dict.common.save}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function RemoveStoreButton({ storeId, name }: { storeId: string; name: string }) {
  const { dict } = useI18n();
  return (
    <form
      action={removeStore}
      onSubmit={(e) => {
        if (!confirm(t(dict.stores.removeConfirm, { name }))) e.preventDefault();
      }}
    >
      <input type="hidden" name="storeId" value={storeId} />
      <button type="submit" className={cn(buttonStyles.ghost, "text-red-600 dark:text-red-400")}>
        {dict.stores.remove}
      </button>
    </form>
  );
}

export function OpenStoreButton({ storeId, label }: { storeId: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={buttonStyles.secondary}
      onClick={() =>
        startTransition(async () => {
          await switchStore(storeId);
          router.push("/");
          router.refresh();
        })
      }
    >
      {label}
    </button>
  );
}
