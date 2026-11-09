# 0004 — Better Auth para autenticação

- **Status:** aceita
- **Data:** 2026-11-09

## Contexto

Ferramenta interna: poucos usuários, sem cadastro público, sessões revogáveis, e dados de auth
no nosso próprio Postgres.

## Decisão

Better Auth com adapter Prisma: e-mail/senha com `disableSignUp`, GitHub OAuth opcional com
allowlist (`ALLOWED_EMAILS` via `validateUserInfo`), rate limit no login. Checagem otimista no
`proxy.ts` e autorização real na DAL (`requireUser()`).

## Alternativas

- **Auth.js (NextAuth)**: v5 ficou longamente em beta; o projeto passou a ser mantido pela equipe
  do Better Auth.
- **Supabase Auth**: acoplaria a autenticação ao provedor do banco.
- **Clerk**: ótimo DX, mas SaaS pago e dados de usuário fora do nosso banco.

## Consequências

- (+) Sessões no banco (revogação imediata no logout), sem vendor lock-in.
- (−) Tabelas de auth no nosso schema, versionadas por migração (é o que queremos).
