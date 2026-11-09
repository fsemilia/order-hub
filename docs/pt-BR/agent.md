# Agente de retenção

Responde perguntas sobre a base de clientes e escreve rascunhos de mensagens de retenção.

## Como funciona

```text
Pergunta (Server Action, autenticada, Zod)
  → limite diário por usuário (agent_runs)
  → Anthropic SDK tool runner (Claude, effort "medium", máx. 6 iterações)
      ↔ get_store_overview / find_customers / get_customer_profile   (somente leitura)
  → resposta como rascunho editável na tela
  → agent_runs: pergunta, resposta, ferramentas, tokens, latência
```

## Ferramentas

| Ferramenta             | Entrada                 | Retorna                                                                   |
| ---------------------- | ----------------------- | ------------------------------------------------------------------------- |
| `get_store_overview`   | —                       | clientes por segmento, faturamento 30/90d, ticket médio, top produtos     |
| `find_customers`       | `segment`, `limit ≤ 50` | id, primeiro nome, pedidos, LTV, ticket médio, dias desde a última compra |
| `get_customer_profile` | `customer_id`           | métricas, consentimento de marketing, últimos 10 pedidos com itens        |

Todas reutilizam `lib/crm/queries.ts`, que tem testes de integração.

## Princípios

- **Somente leitura**: nenhuma ferramenta escreve no banco ou envia mensagens. Ações com efeito
  colateral são sempre de um humano.
- **Minimização de dados (LGPD)**: o modelo recebe primeiro nome e id interno — nunca e-mail,
  telefone ou sobrenome. Só sugere marketing para quem deu consentimento.
- **Valores pré-formatados em R$**: o modelo não faz contas com dinheiro.
- **Dados da loja são dados**: nomes e títulos de produtos podem conter texto malicioso
  (prompt injection); o prompt instrui o modelo a tratá-los como dados, e as ferramentas não
  permitem nenhuma ação perigosa mesmo que ele obedeça.
- **Custo controlado**: limite diário (`AGENT_DAILY_LIMIT`), iterações limitadas, prompt estático
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
