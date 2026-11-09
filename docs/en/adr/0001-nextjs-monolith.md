# 0001 — Next.js monolith (App Router) with Cache Components

🌐 **English** · [Português](../../pt-BR/adr/0001-nextjs-monolith.md) · [Italiano](../../it/adr/0001-nextjs-monolith.md)

- **Status:** accepted
- **Date:** 2026-11-09

## Context

Small team, internal product, webhook-based integrations and a dashboard. We need to ship fast
without giving up end-to-end types and tests.

## Decision

A single Next.js 16 app: Route Handlers for webhooks and auth, Server Components reading the
database through `lib/crm/queries.ts`, Server Actions for mutations and for the agent.
`cacheComponents` enabled: static shell + request-dependent content inside `<Suspense>`.

## Consequences

- (+) One deploy, one repository, one type system; a preview per PR on Vercel.
- (+) Domain logic lives in `lib/` without depending on Next, so it is testable in isolation.
- (−) Webhooks and UI scale together; if volume grows, processing moves to a queue (ADR 0003)
  without changing the domain.
- (−) Cache Components requires discipline (Suspense for request data); the build enforces it.
