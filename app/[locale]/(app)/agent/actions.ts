"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { apiKeySchema, deleteUserAgentKey, saveUserAgentKey } from "@/lib/agent/credentials";
import { runAgent, type AgentResult } from "@/lib/agent/run";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { logger } from "@/lib/logger";
import { requireUser } from "@/lib/session";
import { requireStoreContext } from "@/lib/stores/current";

export type AskState = AgentResult | { ok: false; error: string } | null;
export type KeyFormState = null | { ok: boolean; message: string };

async function localeOf(formData: FormData) {
  const sent = formData.get("locale");
  return isLocale(sent) ? sent : await getRequestLocale();
}

export async function askAgent(_prev: AskState, formData: FormData): Promise<AskState> {
  // Server Actions are public endpoints: authorize inside, never rely on the page.
  const { user, store } = await requireStoreContext();
  const locale = await localeOf(formData);
  const errors = getDictionary(locale).agent.errors;

  const parsed = z
    .string()
    .trim()
    .min(5, errors.tooShort)
    .max(1000, errors.tooLong)
    .safeParse(formData.get("question"));
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? errors.invalid };

  return runAgent(parsed.data, { user, store, locale });
}

/** Stores the user's own Anthropic key, encrypted. The key is never echoed back or logged. */
export async function saveAgentKey(_prev: KeyFormState, formData: FormData): Promise<KeyFormState> {
  const user = await requireUser();
  const k = getDictionary(await localeOf(formData)).agent.key;
  const parsed = apiKeySchema.safeParse(formData.get("apiKey"));
  if (!parsed.success) return { ok: false, message: k.invalid };

  await saveUserAgentKey(user, parsed.data);
  logger.info("agent.key_saved", { by: user.id });
  refresh();
  return { ok: true, message: k.saved };
}

export async function removeAgentKey() {
  const user = await requireUser();
  await deleteUserAgentKey(user);
  logger.info("agent.key_removed", { by: user.id });
  refresh();
}
