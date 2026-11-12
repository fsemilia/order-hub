import "server-only";
import { z } from "zod";

/**
 * Typed, validated environment. Parsed lazily on first access so that `next build`
 * (which imports every route) does not crash when optional integrations are not configured.
 */
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(emptyToUndefined, schema.optional());

const emailList = z
  .string()
  .default("")
  .transform((s) =>
    s
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),

  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 chars"),
  BETTER_AUTH_URL: optional(z.url()),
  ALLOWED_EMAILS: emailList,
  GITHUB_CLIENT_ID: optional(z.string()),
  GITHUB_CLIENT_SECRET: optional(z.string()),

  // 32 random bytes, base64 (`openssl rand -base64 32`): encrypts per-store webhook secrets.
  STORE_SECRETS_KEY: z.string().refine((v) => Buffer.from(v, "base64").length === 32, {
    message: "STORE_SECRETS_KEY must be 32 bytes, base64-encoded",
  }),

  // The operator's key: used ONLY by AGENT_OWNER_EMAILS. Everyone else brings their own key.
  // Validated where it is used (lib/agent/credentials.ts): a malformed key disables only the
  // agent, never login or the webhook pipeline.
  ANTHROPIC_API_KEY: optional(z.string()),
  AGENT_OWNER_EMAILS: emailList,
  // Shared demo login (prisma/seed.ts): its agent key is bound to the session, not the user.
  DEMO_EMAIL: z.preprocess(emptyToUndefined, z.string().default("demo@orderhub.dev")),
  ANTHROPIC_MODEL: z.preprocess(emptyToUndefined, z.string().default("claude-opus-5-5")),
  AGENT_DAILY_LIMIT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(20)),

  CRM_RISK_DAYS: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(60)),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment variables:\n${issues.join("\n")}`);
  }
  cached = parsed.data;
  return cached;
}
