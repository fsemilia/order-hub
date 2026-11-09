"use server";

import { z } from "zod";
import { requireUser } from "@/lib/session";
import { runAgent, type AgentResult } from "@/lib/agent/run";

const questionSchema = z
  .string()
  .trim()
  .min(5, "Pergunta muito curta.")
  .max(1000, "Pergunta muito longa.");

export type AskState = AgentResult | { ok: false; error: string } | null;

export async function askAgent(_prev: AskState, formData: FormData): Promise<AskState> {
  // Server Actions are public endpoints: authorize inside, never rely on the page.
  const user = await requireUser();
  const parsed = questionSchema.safeParse(formData.get("question"));
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Pergunta inválida." };
  return runAgent(parsed.data, user.id);
}
