# 0005 — Agente de IA somente leitura, com revisão humana

- **Status:** aceita
- **Data:** 2026-11-09

## Contexto

A equipe quer perguntar sobre a base em linguagem natural e receber rascunhos de mensagens de
retenção. Riscos: alucinação, vazamento de dados pessoais (LGPD), prompt injection via dados da
loja e custo.

## Decisão

- Tool calling com o tool runner do Anthropic SDK e ferramentas Zod **somente leitura** sobre as
  mesmas consultas testadas do painel.
- Minimização: o modelo recebe primeiro nome e id interno, nunca contato.
- Saída sempre como rascunho editável; nada é enviado automaticamente.
- Limite diário por usuário, máximo de iterações, auditoria em `agent_runs`.
- Fallback de recusa no servidor e tratamento explícito de `refusal`.

## Consequências

- (+) Mesmo um prompt injection bem-sucedido não tem ferramenta perigosa para usar.
- (+) Custos e comportamento observáveis por execução.
- (−) Para enviar a campanha, um humano copia o rascunho — intencional nesta fase.
