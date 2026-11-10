# Agente de retenção

🌐 [English](../en/agent.md) · **Português** · [Italiano](../it/agent.md)

Responde perguntas sobre a base de clientes da loja atual, incluindo carrinhos abandonados, e
escreve rascunhos de mensagens de retenção no idioma da interface (inglês, português ou italiano).

## Como funciona

```text
Pergunta (Server Action, autenticada, Zod)
  → cota por usuário nas últimas 24 h (agent_runs)
  → Anthropic SDK tool runner (Claude, effort "medium", máx. 6 iterações)
      ↔ get_store_overview / find_customers / get_customer_profile / list_abandoned_checkouts   (somente leitura)
  → resposta como rascunho editável na tela
  → agent_runs: pergunta, resposta, ferramentas, tokens, latência
```

## Ferramentas

| Ferramenta                 | Entrada                 | Retorna                                                                                                           |
| -------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `get_store_overview`       | —                       | clientes por segmento, faturamento 30/90d, ticket médio, top produtos                                             |
| `find_customers`           | `segment`, `limit ≤ 50` | id, primeiro nome, pedidos, LTV, ticket médio, dias desde a última compra                                         |
| `get_customer_profile`     | `customer_id`           | métricas, consentimento de marketing, últimos 10 pedidos com itens                                                |
| `list_abandoned_checkouts` | `limit ≤ 30`            | id do cliente, primeiro nome (null para visitantes), consentimento, itens, valor, dias desde o início do carrinho |

Todas reutilizam `lib/crm/queries.ts`, que tem testes de integração.

## Princípios

- **Somente leitura**: nenhuma ferramenta escreve no banco ou envia mensagens. Ações com efeito
  colateral são sempre de um humano.
- **Minimização de dados (LGPD)**: o modelo recebe primeiro nome e id interno — nunca e-mail,
  telefone ou sobrenome. Só sugere marketing para quem deu consentimento.
- **Valores pré-formatados na moeda da loja**: o modelo não faz contas com dinheiro.
- **Vinculado à loja atual**: o servidor cria as ferramentas com o `storeId` da loja atual do
  usuário; o modelo não pode escolher nem ver outra loja. Cada execução é salva com seu `storeId`.
- **Responde no idioma da interface**: o prompt de sistema é em inglês e um segundo bloco pede
  inglês, português ou italiano, conforme a interface.
- **Dados da loja são dados**: nomes e títulos de produtos podem conter texto malicioso
  (prompt injection); o prompt instrui o modelo a tratá-los como dados, e as ferramentas não
  permitem nenhuma ação perigosa mesmo que ele obedeça.
- **Custo controlado**: cota (`AGENT_DAILY_LIMIT` em 24 h móveis), iterações limitadas, prompt estático
  (cacheável) e tokens registrados por execução.
- **Recusas**: fallback de recusa no servidor (`fallbacks: "default"`) e tratamento de
  `stop_reason: "refusal"` com mensagem clara.

## Configuração

| Variável            | Padrão                                           |
| ------------------- | ------------------------------------------------ |
| `ANTHROPIC_API_KEY` | — (sem chave, a página mostra "não configurado") |
| `ANTHROPIC_MODEL`   | `claude-opus-5-5`                                |
| `AGENT_DAILY_LIMIT` | `20`                                             |

## Auditoria

```sql
select created_at, question, input_tokens, output_tokens, duration_ms, error
from agent_runs order by created_at desc limit 20;
```

## Limitações

Sem avaliação automatizada, uma pergunta por vez, cota em janela móvel, prompt injection mitigado
mas não impossível, dados enviados a terceiros: ver [`limitations.md`](limitations.md), itens G1–G5.
