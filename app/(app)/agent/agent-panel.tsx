"use client";

import { useActionState, useRef, useState } from "react";
import { buttonStyles, Card, inputStyles } from "@/components/ui";
import { askAgent, type AskState } from "./actions";

const TOOL_LABELS: Record<string, string> = {
  get_store_overview: "Visão geral da loja",
  find_customers: "Busca de clientes",
  get_customer_profile: "Perfil do cliente",
};

export function AgentPanel({
  suggestions,
  initialQuota,
}: {
  suggestions: string[];
  initialQuota: number;
}) {
  const [state, formAction, pending] = useActionState<AskState, FormData>(askAgent, null);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const quota = state?.ok ? initialQuota - 1 : initialQuota;

  return (
    <div className="space-y-6">
      <Card>
        <form action={formAction} className="space-y-3">
          <label htmlFor="question" className="block text-sm font-medium">
            Sua pergunta
          </label>
          <textarea
            ref={textareaRef}
            id="question"
            name="question"
            required
            rows={3}
            maxLength={1000}
            placeholder="Ex.: Quais clientes estão em risco? Escreva um e-mail de reativação."
            className={inputStyles}
          />
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
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
              {Math.max(0, quota)} perguntas restantes hoje
            </span>
            <button type="submit" disabled={pending || quota <= 0} className={buttonStyles.primary}>
              {pending ? "Analisando…" : "Perguntar"}
            </button>
          </div>
        </form>
      </Card>

      {pending && (
        <Card aria-live="polite" className="text-sm text-zinc-500">
          Consultando o banco de dados e preparando a resposta…
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
            <span>Ferramentas usadas:</span>
            {state.toolCalls.length === 0 && <span>nenhuma</span>}
            {state.toolCalls.map((t, i) => (
              <span
                key={i}
                className="rounded bg-zinc-100 px-2 py-0.5 font-mono dark:bg-zinc-800"
                title={JSON.stringify(t.input)}
              >
                {TOOL_LABELS[t.name] ?? t.name} · {t.ms}ms
              </span>
            ))}
            <span className="ml-auto">{(state.durationMs / 1000).toFixed(1)}s</span>
          </div>
          {/* Human-in-the-loop: the answer is an editable draft, never sent automatically. */}
          <label htmlFor="answer" className="block text-sm font-medium">
            Resposta (rascunho — revise antes de usar)
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
              {copied ? "Copiado!" : "Copiar rascunho"}
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
