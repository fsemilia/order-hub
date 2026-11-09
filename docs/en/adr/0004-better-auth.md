# 0004 — Better Auth for authentication

🌐 **English** · [Português](../../pt-BR/adr/0004-better-auth.md) · [Italiano](../../it/adr/0004-better-auth.md)

- **Status:** accepted
- **Date:** 2026-11-09

## Context

Internal tool: few users, no public sign-up, revocable sessions, and auth data in our own
Postgres.

## Decision

Better Auth with the Prisma adapter: email/password with `disableSignUp`, optional GitHub OAuth
with an allowlist (`ALLOWED_EMAILS` via `validateUserInfo`), rate limit on sign-in. Optimistic
check in `proxy.ts` and real authorization in the DAL (`requireUser()`).

## Alternatives

- **Auth.js (NextAuth)**: v5 stayed in beta for a long time; the project is now maintained by the
  Better Auth team.
- **Supabase Auth**: would couple authentication to the database provider.
- **Clerk**: great DX, but a paid SaaS and user data outside our database.

## Consequences

- (+) Sessions in the database (immediate revocation on logout), no vendor lock-in.
- (−) Auth tables in our schema, versioned by migrations (which is what we want).
- (−) No password reset, email verification or roles yet: see [limitations.md](../limitations.md), items A1–A3.
