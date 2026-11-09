# 0001 — Monólito Next.js (App Router) com Cache Components

🌐 [English](../../en/adr/0001-nextjs-monolith.md) · **Português** · [Italiano](../../it/adr/0001-nextjs-monolith.md)

- **Status:** aceita
- **Data:** 2026-11-09

## Contexto

Equipe pequena, produto interno, integrações via webhook e um painel. Precisamos entregar rápido
sem abrir mão de tipos de ponta a ponta e de testes.

## Decisão

Um único app Next.js 16: Route Handlers para webhooks e auth, Server Components lendo o banco via
`lib/crm/queries.ts`, Server Actions para mutações e para o agente. `cacheComponents` ligado:
shell estático + conteúdo dependente da requisição em `<Suspense>`.

## Consequências

- (+) Um deploy, um repositório, um sistema de tipos; preview por PR na Vercel.
- (+) A lógica de domínio fica em `lib/` sem depender do Next, então é testável isoladamente.
- (−) Webhooks e UI escalam juntos; se o volume crescer, o processamento migra para uma fila
  (ADR 0003) sem mudar o domínio.
- (−) Cache Components impõe disciplina (Suspense para dados de requisição); o build valida.
