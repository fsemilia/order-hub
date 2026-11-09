## O quê / por quê

<!-- Qual problema este PR resolve? Link para a issue, se houver. -->

## Como testar

- [ ] `npm run check` (lint + types + unit)
- [ ] `npm run test:integration` (se tocou banco/webhooks)
- [ ] `npm run test:e2e` (se tocou UI/autenticação)

## Checklist

- [ ] Dinheiro continua em `Decimal`/centavos (sem `float`)
- [ ] Webhooks: HMAC no raw body, idempotência e transação preservados
- [ ] Nenhum dado pessoal novo enviado ao LLM (LGPD)
- [ ] Migração Prisma nova é aditiva / tem plano de rollback
- [ ] Documentação atualizada em EN, PT-BR e IT (incluindo `limitations.md`, se aplicável)
- [ ] Código gerado por IA revisado linha a linha
