import { z } from "zod";

/**
 * Shape of an Anthropic API key. Also applied to the operator's ANTHROPIC_API_KEY (lib/agent/credentials.ts):
 * the restricted alphabet guarantees a key can never break an HTTP header, so it can never be
 * echoed back inside an error message that ends up in logs or `agent_runs.error`.
 */
export const apiKeySchema = z
  .string()
  .trim()
  .max(256)
  .regex(/^sk-ant-[A-Za-z0-9_-]{20,}$/);
