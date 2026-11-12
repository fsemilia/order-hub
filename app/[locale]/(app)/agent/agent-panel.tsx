"use client";

import { useActionState, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { buttonStyles, Card, inputStyles } from "@/components/ui";
import { plural } from "@/lib/i18n";
import { askAgent, type AskState } from "./actions";

/** `initialQuota` is null when no quota applies (the user runs the agent on their own key). */
export function AgentPanel({ initialQuota }: { initialQuota: number | null }) {
  const { locale, dict } = useI18n();
  const a = dict.agent;
  const [state, formAction, pending] = useActionState<AskState, FormData>(askAgent, null);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const quota =
    initialQuota === null
      ? null
      : state?.ok && state.quotaApplies
        ? initialQuota - 1
        : initialQuota;

  return (
    <div className="space-y-6">
      <Card>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="locale" value={locale} />
          <label htmlFor="question" className="block text-sm font-medium">
            {a.question}
          </label>
          <textarea
            ref={textareaRef}
            id="question"
            name="question"
            required
            rows={3}
            maxLength={1000}
            placeholder={a.placeholder}
            className={inputStyles}
          />
          <div className="flex flex-wrap gap-2">
            {a.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                onClick={() => {
                  if (textareaRef.current) textareaRef.current.value = s;
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">
              {quota !== null && plural(a.remaining, Math.max(0, quota), locale)}
            </span>
            <button
              type="submit"
              disabled={pending || (quota !== null && quota <= 0)}
              className={buttonStyles.primary}
            >
              {pending ? a.asking : a.ask}
            </button>
          </div>
        </form>
      </Card>

      {pending && (
        <Card aria-live="polite" className="text-sm text-zinc-500">
          {a.working}
        </Card>
      )}

      {!pending && state && !state.ok && (
        <Card
          role="alert"
          className="border-red-200 text-sm text-red-700 dark:border-red-900 dark:text-red-400"
        >
          {state.error}
        </Card>
      )}

      {!pending && state?.ok && (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>{a.toolsUsed}</span>
            {state.toolCalls.length === 0 && <span>{dict.common.none}</span>}
            {state.toolCalls.map((t, i) => (
              <span
                key={i}
                className="rounded bg-zinc-100 px-2 py-0.5 font-mono dark:bg-zinc-800"
                title={JSON.stringify(t.input)}
              >
                {a.tools[t.name] ?? t.name} · {t.ms}ms
              </span>
            ))}
            <span className="ml-auto">{(state.durationMs / 1000).toFixed(1)}s</span>
          </div>
          {/* Human-in-the-loop: the answer is an editable draft, never sent automatically. */}
          <label htmlFor="answer" className="block text-sm font-medium">
            {a.answer}
          </label>
          <textarea
            key={state.runId}
            id="answer"
            defaultValue={state.answer}
            rows={Math.min(24, state.answer.split("\n").length + 2)}
            className={`${inputStyles} font-mono text-[13px] leading-relaxed`}
          />
          <div className="flex justify-end">
            <button
              type="button"
              className={buttonStyles.secondary}
              onClick={async () => {
                const el = document.getElementById("answer") as HTMLTextAreaElement | null;
                await navigator.clipboard.writeText(el?.value ?? state.answer);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? a.copied : a.copy}
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
