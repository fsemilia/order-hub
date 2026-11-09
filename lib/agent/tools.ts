import "server-only";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { getCustomerDetail, getStoreOverview, listCustomers } from "@/lib/crm/queries";
import { formatCents } from "@/lib/money";
import { SEGMENTS } from "@/lib/crm/segments";

export type ToolCallTrace = { name: string; input: unknown; ms: number; error?: string };

/**
 * Read-only tools exposed to the model.
 *
 * Design rules (see docs/agent.md):
 * - Read-only: the agent can never write to the DB or send anything. Drafts go to a human.
 * - Data minimization (LGPD): the model gets first name + internal id, never email/phone/last name.
 * - Values are pre-formatted in BRL so the model does not do money arithmetic.
 * - Every call is traced (name, input, latency) and stored in AgentRun for audit.
 */
export function createAgentTools(trace: ToolCallTrace[]) {
  async function traced<T>(name: string, input: unknown, fn: () => Promise<T>): Promise<string> {
    const start = Date.now();
    try {
      const result = await fn();
      trace.push({ name, input, ms: Date.now() - start });
      return JSON.stringify(result);
    } catch (e) {
      trace.push({ name, input, ms: Date.now() - start, error: String(e) });
      throw e;
    }
  }

  const firstName = (name: string) => name.split(" ")[0];

  const getStoreOverviewTool = betaZodTool({
    name: "get_store_overview",
    description:
      "Visão geral da loja: número de clientes por segmento (novo, recorrente, em_risco, sem_compras), " +
      "faturamento e pedidos dos últimos 30 e 90 dias, ticket médio e produtos mais vendidos em 90 dias. " +
      "Use para perguntas gerais sobre a base de clientes ou o desempenho da loja.",
    inputSchema: z.object({}),
    run: (input) =>
      traced("get_store_overview", input, async () => {
        const o = await getStoreOverview();
        return {
          dias_para_risco: o.riskDays,
          clientes_por_segmento: Object.fromEntries(o.segments.map((s) => [s.segment, s.count])),
          faturamento_30d: formatCents(o.revenue30Cents),
          pedidos_30d: o.orders30,
          faturamento_90d: formatCents(o.revenue90Cents),
          pedidos_90d: o.orders90,
          ticket_medio: formatCents(o.avgTicketCents),
          top_produtos_90d: o.topProducts90,
        };
      }),
  });

  const findCustomersTool = betaZodTool({
    name: "find_customers",
    description:
      "Lista clientes de um segmento, ordenados por LTV (valor total gasto) decrescente. " +
      "Retorna id interno, primeiro nome, nº de pedidos, LTV, ticket médio, dias desde a última compra " +
      "e se aceita marketing. Use para encontrar clientes em risco, recorrentes ou novos.",
    inputSchema: z.object({
      segment: z.enum(SEGMENTS).describe("Segmento de clientes"),
      limit: z.number().int().min(1).max(50).default(10).describe("Máximo de clientes (1-50)"),
    }),
    run: (input) =>
      traced("find_customers", input, async () => {
        const now = new Date();
        const { rows, total } = await listCustomers(
          {
            segment: input.segment,
            limit: input.limit,
            sort: "ltv",
          },
          now,
        );
        return {
          total_no_segmento: total,
          clientes: rows.map((c) => ({
            id: c.id,
            primeiro_nome: firstName(c.name),
            pedidos: c.ordersCount,
            ltv: formatCents(c.ltvCents),
            ticket_medio: formatCents(c.avgTicketCents),
            dias_desde_ultima_compra: c.lastOrderAt
              ? Math.floor((now.getTime() - c.lastOrderAt.getTime()) / 86_400_000)
              : null,
          })),
        };
      }),
  });

  const getCustomerProfileTool = betaZodTool({
    name: "get_customer_profile",
    description:
      "Perfil de um cliente pelo id interno (obtido com find_customers): métricas, consentimento de " +
      "marketing e os últimos 10 pedidos com produtos. Use antes de escrever uma mensagem personalizada.",
    inputSchema: z.object({ customer_id: z.string().min(1).describe("id interno do cliente") }),
    run: (input) =>
      traced("get_customer_profile", input, async () => {
        const c = await getCustomerDetail(input.customer_id);
        if (!c) return { erro: "cliente não encontrado" };
        return {
          id: c.id,
          primeiro_nome: firstName(c.name),
          segmento: c.segment,
          pedidos: c.ordersCount,
          ltv: formatCents(c.ltvCents),
          ticket_medio: formatCents(c.avgTicketCents),
          dias_desde_ultima_compra: c.daysSinceLastOrder,
          aceita_marketing: c.acceptsMarketing,
          ultimos_pedidos: c.orders.slice(0, 10).map((o) => ({
            data: o.placedAt.toISOString().slice(0, 10),
            total: formatCents(o.totalCents, o.currency),
            status: o.cancelled ? "cancelado" : o.financialStatus,
            itens: o.items,
          })),
        };
      }),
  });

  return [getStoreOverviewTool, findCustomersTool, getCustomerProfileTool];
}
