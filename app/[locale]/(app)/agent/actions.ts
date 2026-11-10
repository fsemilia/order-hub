"use server";

import { z } from "zod";
import { runAgent, type AgentResult } from "@/lib/agent/run";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { requireStoreContext } from "@/lib/stores/current";

export type AskState = AgentResult | { ok: false; error: string } | null;

export async function askAgent(_prev: AskState, formData: FormData): Promise<AskState> {
  // Server Actions are public endpoints: authorize inside, never rely on the page.
  const { user, store } = await requireStoreContext();
  const sent = formData.get("locale");
  const locale = isLocale(sent) ? sent : await getRequestLocale();
  const errors = getDictionary(locale).agent.errors;

  const parsed = z
    .string()
    .trim()
    .min(5, errors.tooShort)
    .max(1000, errors.tooLong)
    .safeParse(formData.get("question"));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? errors.invalid };

  return runAgent(parsed.data, { userId: user.id, store, locale });
}
