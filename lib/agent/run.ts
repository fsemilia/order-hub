import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { DAY_MS } from "@/lib/crm/segments";
import { SYSTEM_PROMPT } from "./prompt";
import { createAgentTools, type ToolCallTrace } from "./tools";

export type AgentResult =
  | { ok: true; runId: string; answer: string; toolCalls: ToolCallTrace[]; durationMs: number }
  | { ok: false; error: string };

const MAX_ITERATIONS = 6;

// Tool inputs were parsed from JSON by the SDK, so the trace is JSON-safe by construction.
const asJson = (trace: ToolCallTrace[]) => trace as unknown as Prisma.InputJsonValue;

let client: Anthropic | undefined;
function getClient() {
  client ??= new Anthropic({ apiKey: env().ANTHROPIC_API_KEY, maxRetries: 2, timeout: 90_000 });
  return client;
}

export function isAgentConfigured() {
  return Boolean(env().ANTHROPIC_API_KEY);
}

export async function remainingQuota(userId: string, now = new Date()) {
  const used = await prisma.agentRun.count({
    where: { userId, createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
  });
  return Math.max(0, env().AGENT_DAILY_LIMIT - used);
}

/**
 * Runs the retention agent on one question.
 *
 * - Tool loop driven by the SDK tool runner, bounded by MAX_ITERATIONS.
 * - Server-side refusal fallback enabled ("default" routing by refusal category).
 * - Token usage summed across every turn and stored in AgentRun (cost tracking + daily quota).
 */
export async function runAgent(question: string, userId: string): Promise<AgentResult> {
  if (!isAgentConfigured())
    return { ok: false, error: "Agente não configurado (ANTHROPIC_API_KEY)." };
  if ((await remainingQuota(userId)) <= 0) {
    return {
      ok: false,
      error: "Limite de perguntas das últimas 24 horas atingido. Tente mais tarde.",
    };
  }

  const run = await prisma.agentRun.create({ data: { userId, question } });
  const trace: ToolCallTrace[] = [];
  const start = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const runner = getClient().beta.messages.toolRunner({
      model: env().ANTHROPIC_MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      tools: createAgentTools(trace),
      messages: [{ role: "user", content: question }],
      max_iterations: MAX_ITERATIONS,
    });

    let final: Anthropic.Beta.BetaMessage | undefined;
    for await (const message of runner) {
      inputTokens += message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0);
      outputTokens += message.usage.output_tokens;
      final = message;
    }
    if (!final) throw new Error("Agent produced no message");

    let answer = final.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (final.stop_reason === "refusal") {
      answer = "O modelo não pôde responder a esta pergunta. Reformule com foco nos dados da loja.";
    } else if (final.stop_reason === "tool_use") {
      answer ||= "A análise ficou longa demais. Tente uma pergunta mais específica.";
    }

    const durationMs = Date.now() - start;
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { answer, toolCalls: asJson(trace), inputTokens, outputTokens, durationMs },
    });
    logger.info("agent.run", {
      runId: run.id,
      durationMs,
      inputTokens,
      outputTokens,
      tools: trace.length,
    });
    return { ok: true, runId: run.id, answer, toolCalls: trace, durationMs };
  } catch (e) {
    const message =
      e instanceof Anthropic.RateLimitError
        ? "A API de IA está sobrecarregada. Tente em instantes."
        : e instanceof Anthropic.APIError
          ? `Erro da API de IA (${e.status ?? "rede"}).`
          : "Erro inesperado ao executar o agente.";
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { error: String(e), toolCalls: asJson(trace), durationMs: Date.now() - start },
    });
    logger.error("agent.failed", { runId: run.id, error: String(e) });
    return { ok: false, error: message };
  }
}
