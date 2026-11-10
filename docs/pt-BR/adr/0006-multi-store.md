# 0006 — Multi-loja com segredos de webhook criptografados por loja

🌐 [English](../../en/adr/0006-multi-store.md) · **Português** · [Italiano](../../it/adr/0006-multi-store.md)

- **Status:** aceita
- **Data:** 2026-11-09

## Contexto

A equipe trabalha com vários lojistas e quer manter os dados demo ao lado de lojas Shopify reais.
Até agora havia um único segredo de webhook em uma variável de ambiente, e os dados de duas lojas
se misturariam. Os ids da Shopify só são únicos dentro de uma loja.

## Decisão

- Uma tabela `Store` (`DEMO` | `SHOPIFY`); `storeId` em clientes, pedidos, checkouts e eventos de
  webhook; as chaves únicas passam a ser `(storeId, shopifyId)`. A migration é expand → backfill →
  contract: as linhas existentes vão para uma loja fixa `demo`, então os dados de produção
  sobrevivem.
- A rota de webhook identifica a loja por `X-Shopify-Shop-Domain` e verifica o HMAC com o segredo
  **daquela loja**. Loja desconhecida e assinatura inválida retornam o mesmo `401`.
- Os segredos são informados na interface e salvos criptografados com AES-256-GCM
  (`STORE_SECRETS_KEY`, formato versionado `v1.`). Nunca voltam ao navegador nem aparecem em logs.
- Toda consulta recebe um `storeId`; `requireStoreContext()` devolve o usuário e a loja atual
  (cookie `oh_store`, revalidado no banco a cada requisição). As ferramentas do agente são
  vinculadas a essa loja pelo servidor.
- Entregas duplicadas são detectadas com `createMany({ skipDuplicates })` no log de eventos: uma
  violação de unicidade em outro lugar (duas entregas do mesmo pedido em corrida) não é mais
  confundida com duplicata e é reprocessada.

## Consequências

- (+) Lojas reais e dados demo lado a lado; trocar de loja é um clique.
- (+) Um dump vazado do banco não expõe segredos de webhook utilizáveis sem a chave.
- (−) As lojas são conectadas à mão (sem instalação OAuth), qualquer usuário gerencia todas as
  lojas e a chave não tem rotação automatizada: [limitations.md](../limitations.md), itens F1, A5, R7.
