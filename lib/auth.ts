import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

const {
  BETTER_AUTH_SECRET,
  BETTER_AUTH_URL,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  ALLOWED_EMAILS,
} = env();

const configuredHost = BETTER_AUTH_URL ? new URL(BETTER_AUTH_URL).host : "localhost:3000";

/**
 * Internal tool: there is no public sign-up.
 * - Email/password: only users created by the seed (or an admin) can sign in.
 * - GitHub OAuth (optional): only emails listed in ALLOWED_EMAILS are admitted.
 */
export const auth = betterAuth({
  secret: BETTER_AUTH_SECRET,
  baseURL: {
    // Production domain + Vercel preview deployments + local dev
    allowedHosts: [configuredHost, "*.vercel.app", "localhost:3000"],
    fallback: BETTER_AUTH_URL,
  },
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 10,
  },
  socialProviders:
    GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET
      ? { github: { clientId: GITHUB_CLIENT_ID, clientSecret: GITHUB_CLIENT_SECRET } }
      : undefined,
  // Do not enable `user.changeEmail`: AGENT_OWNER_EMAILS grants the operator's Anthropic key by
  // email (lib/agent/credentials.ts), so emails must stay immutable for users.
  user: {
    validateUserInfo: ({ user, source }) => {
      if (source.method !== "oauth") return;
      const email = String(user.email ?? "").toLowerCase();
      if (!ALLOWED_EMAILS.includes(email)) {
        return {
          error: "not_allowed",
          errorDescription: "Este e-mail não tem acesso ao Order Hub.",
        };
      }
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
    // Brute-force guard: 10 sign-in attempts per IP per minute.
    // Note: the default storage is in-memory (per serverless instance); use storage: "database"
    // or Redis if the limit must be global across instances.
    customRules: { "/sign-in/email": { window: 60, max: 10 } },
  },
  // Must be last: lets server actions set auth cookies.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
