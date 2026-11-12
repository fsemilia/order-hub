import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { apiKeySchema } from "./key-format";

export { apiKeySchema };

/**
 * Which Anthropic API key the agent uses for a user (bring your own key).
 *
 * 1. The user's own key, stored encrypted in `agent_credentials`.
 * 2. Otherwise the operator's `ANTHROPIC_API_KEY`, but ONLY for emails in `AGENT_OWNER_EMAILS`.
 * 3. Otherwise none: the agent asks the user for their key.
 *
 * Shared accounts (the demo user, `DEMO_EMAIL`) are used by several people with the same login,
 * so their key is bound to the *session*, not the user: it disappears at sign-out (the session
 * row cascades) and another visitor signed in to the same account never sees or uses it.
 *
 * The plaintext key never leaves the server: the UI only gets the source and the last 4 chars.
 */

export type OwnerConfig = { ownerKey?: string; ownerEmails: string[]; demoEmail?: string };

export type AgentKeyStatus =
  | { source: "user"; hint: string; perSession: boolean }
  | { source: "owner" }
  | { source: "none"; perSession: boolean };

export type ResolvedAgentKey =
  | { ok: true; source: "user" | "owner"; apiKey: string }
  | { ok: false; reason: "none" | "unreadable" };

/** The signed-in user and their current session (from `requireUser()`). */
export type KeyOwner = { id: string; email: string; sessionId: string };

let warnedInvalidOwnerKey = false;

function ownerConfig(): OwnerConfig {
  const e = env();
  const parsed = e.ANTHROPIC_API_KEY ? apiKeySchema.safeParse(e.ANTHROPIC_API_KEY) : undefined;
  // The restricted alphabet keeps the key out of header-validation error messages (and so out
  // of logs). A malformed key is treated as unset: the agent is off for owners, nothing else.
  if (parsed && !parsed.success && !warnedInvalidOwnerKey) {
    logger.error("env.invalid_anthropic_key", {});
    warnedInvalidOwnerKey = true;
  }
  const ownerKey = parsed?.success ? parsed.data : undefined;
  return { ownerKey, ownerEmails: e.AGENT_OWNER_EMAILS, demoEmail: e.DEMO_EMAIL };
}

const normalize = (email: string) => email.trim().toLowerCase();

export function isSharedAccount(email: string, demoEmail = env().DEMO_EMAIL) {
  return normalize(email) === normalize(demoEmail);
}

/** Primary key of a user's credential: per session for shared accounts, per user otherwise. */
export function credentialId(user: KeyOwner, shared = isSharedAccount(user.email)) {
  return shared ? `session:${user.sessionId}` : `user:${user.id}`;
}

/**
 * Pure decision, unit-tested: the user's key wins; the operator key only for owner emails, and
 * never for the shared demo account, even if it is listed in AGENT_OWNER_EMAILS by mistake.
 */
export function pickAgentKey(
  email: string,
  userKey: string | null,
  { ownerKey, ownerEmails, demoEmail }: OwnerConfig,
): { source: "user" | "owner"; apiKey: string } | null {
  if (userKey) return { source: "user", apiKey: userKey };
  if (demoEmail && isSharedAccount(email, demoEmail)) return null;
  if (ownerKey && ownerEmails.includes(normalize(email))) {
    return { source: "owner", apiKey: ownerKey };
  }
  return null;
}

export async function getAgentKeyStatus(
  user: KeyOwner,
  config: OwnerConfig = ownerConfig(),
): Promise<AgentKeyStatus> {
  const perSession = isSharedAccount(user.email);
  const row = await prisma.agentCredential.findUnique({
    where: { id: credentialId(user, perSession) },
    select: { keyHint: true },
  });
  if (row) return { source: "user", hint: row.keyHint, perSession };
  return pickAgentKey(user.email, null, config)
    ? { source: "owner" }
    : { source: "none", perSession };
}

/** Decrypted key for one agent run. Never return it to the client or log it. */
export async function resolveAgentKey(
  user: KeyOwner,
  config: OwnerConfig = ownerConfig(),
): Promise<ResolvedAgentKey> {
  const row = await prisma.agentCredential.findUnique({
    where: { id: credentialId(user) },
    select: { apiKeyEnc: true },
  });
  let userKey: string | null = null;
  if (row) {
    try {
      userKey = decryptSecret(row.apiKeyEnc, env().STORE_SECRETS_KEY);
    } catch {
      // Rotated STORE_SECRETS_KEY or a corrupted row: never fall back silently, ask to re-enter.
      logger.error("agent.key_unreadable", { userId: user.id });
      return { ok: false, reason: "unreadable" };
    }
  }
  const key = pickAgentKey(user.email, userKey, config);
  return key ? { ok: true, ...key } : { ok: false, reason: "none" };
}

/** `apiKey` must already be validated with `apiKeySchema`. */
export async function saveUserAgentKey(user: KeyOwner, apiKey: string) {
  const shared = isSharedAccount(user.email);
  const id = credentialId(user, shared);
  const data = {
    apiKeyEnc: encryptSecret(apiKey, env().STORE_SECRETS_KEY),
    keyHint: apiKey.slice(-4),
  };
  await prisma.agentCredential.upsert({
    where: { id },
    create: { id, userId: user.id, sessionId: shared ? user.sessionId : null, ...data },
    update: data,
  });
}

export async function deleteUserAgentKey(user: KeyOwner) {
  await prisma.agentCredential.deleteMany({ where: { id: credentialId(user) } });
}
