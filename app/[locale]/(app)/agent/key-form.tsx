"use client";

import { useActionState, useTransition } from "react";
import { useI18n } from "@/components/i18n-provider";
import { buttonStyles, Card, cn, inputStyles } from "@/components/ui";
import { t } from "@/lib/i18n";
import type { AgentKeyStatus } from "@/lib/agent/credentials";
import { removeAgentKey, saveAgentKey, type KeyFormState } from "./actions";

/** Bring your own key: the user's Anthropic key, stored encrypted and never shown again. */
export function AgentKeyCard({ status }: { status: AgentKeyStatus }) {
  const { locale, dict } = useI18n();
  const k = dict.agent.key;
  const [state, action, pending] = useActionState<KeyFormState, FormData>(saveAgentKey, null);
  const [removing, startRemove] = useTransition();

  const statusText =
    status.source === "user"
      ? t(k.usingOwn, { hint: status.hint })
      : status.source === "owner"
        ? k.usingOwner
        : k.missing;
  const perSession = status.source !== "owner" && status.perSession;

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-sm font-medium">{k.title}</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{statusText}</p>
        {perSession && (
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">{k.sharedAccount}</p>
        )}
      </div>
      <form action={action} className="flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="locale" value={locale} />
        <label htmlFor="apiKey" className="sr-only">
          {k.label}
        </label>
        <input
          id="apiKey"
          name="apiKey"
          type="password"
          required
          autoComplete="off"
          spellCheck={false}
          maxLength={256}
          placeholder="sk-ant-…"
          className={cn(inputStyles, "font-mono sm:flex-1")}
        />
        <button type="submit" disabled={pending} className={buttonStyles.primary}>
          {status.source === "user" ? k.replace : k.save}
        </button>
        {status.source === "user" && (
          <button
            type="button"
            disabled={removing}
            className={buttonStyles.secondary}
            onClick={() => startRemove(() => removeAgentKey())}
          >
            {k.remove}
          </button>
        )}
      </form>
      {state && (
        <p
          role={state.ok ? "status" : "alert"}
          className={cn("text-sm", state.ok ? "text-emerald-600" : "text-red-600")}
        >
          {state.message}
        </p>
      )}
      <p className="text-xs text-zinc-500">
        {k.privacy}{" "}
        <a
          href="https://console.anthropic.com/settings/keys"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          {k.getKey}
        </a>
      </p>
    </Card>
  );
}
