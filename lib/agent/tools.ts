import "server-only";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import {
  getCustomerDetail,
  getStoreOverview,
  listAbandonedCheckouts,
  listCustomers,
} from "@/lib/crm/queries";
import { DAY_MS, SEGMENTS } from "@/lib/crm/segments";
import type { Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/i18n/format";

export type ToolCallTrace = { name: string; input: unknown; ms: number; error?: string };

export type AgentContext = { storeId: string; currency: string; locale: Locale };

/**
 * Read-only tools exposed to the model.
 *
 * Design rules (see docs/agent.md):
 * - Read-only: the agent can never write to the DB or send anything. Drafts go to a human.
 * - Store-scoped: every tool is bound to ONE storeId by the server; the model cannot pick a store.
 * - Data minimization (LGPD): the model gets first name + internal id, never email/phone/last name.
 * - Money is pre-formatted (store currency, UI locale) so the model does no money arithmetic.
 * - Every call is traced (name, input, latency) and stored in AgentRun for audit.
 */
export function createAgentTools(ctx: AgentContext, trace: ToolCallTrace[]) {
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

  const money = (cents: number, currency = ctx.currency) =>
    formatMoney(cents, currency, ctx.locale);
  // Redacted or nameless customers get null: the model must not invent a name.
  const firstName = (c: { name: string | null; redacted: boolean }) =>
    c.redacted || !c.name ? null : (c.name.split(" ")[0] ?? null);

  const getStoreOverviewTool = betaZodTool({
    name: "get_store_overview",
    description:
      "Store overview: customers per segment (novo, recorrente, em_risco, sem_compras), revenue and " +
      "orders for the last 30 and 90 days, average order value, best sellers (90 days) and abandoned " +
      "carts of the last 7 days. Use for general questions about the customer base or performance.",
    inputSchema: z.object({}),
    run: (input) =>
      traced("get_store_overview", input, async () => {
        const o = await getStoreOverview(ctx.storeId);
        return {
          risk_after_days: o.riskDays,
          customers_by_segment: Object.fromEntries(o.segments.map((s) => [s.segment, s.count])),
          revenue_30d: money(o.revenue30Cents),
          orders_30d: o.orders30,
          revenue_90d: money(o.revenue90Cents),
          orders_90d: o.orders90,
          average_order_value: money(o.avgTicketCents),
          top_products_90d: o.topProducts90,
          abandoned_carts_7d: { count: o.abandoned7Count, value: money(o.abandoned7Cents) },
        };
      }),
  });

  const findCustomersTool = betaZodTool({
    name: "find_customers",
    description:
      "Lists customers of a segment, sorted by LTV (total spent) descending. Returns internal id, " +
      "first name, order count, LTV, average order value and days since the last purchase. Use to " +
      "find at-risk, returning or new customers.",
    inputSchema: z.object({
      segment: z.enum(SEGMENTS).describe("Customer segment"),
      limit: z.number().int().min(1).max(50).default(10).describe("Max customers (1-50)"),
    }),
    run: (input) =>
      traced("find_customers", input, async () => {
        const now = new Date();
        const { rows, total } = await listCustomers(
          ctx.storeId,
          { segment: input.segment, limit: input.limit, sort: "ltv" },
          now,
        );
        return {
          total_in_segment: total,
          customers: rows.map((c) => ({
            id: c.id,
            first_name: firstName(c),
            orders: c.ordersCount,
            ltv: money(c.ltvCents),
            average_order_value: money(c.avgTicketCents),
            days_since_last_purchase: c.lastOrderAt
              ? Math.floor((now.getTime() - c.lastOrderAt.getTime()) / DAY_MS)
              : null,
          })),
        };
      }),
  });

  const getCustomerProfileTool = betaZodTool({
    name: "get_customer_profile",
    description:
      "Profile of one customer by internal id (from find_customers or list_abandoned_checkouts): " +
      "metrics, marketing consent and the last 10 orders with products. Use before writing a " +
      "personalized message.",
    inputSchema: z.object({ customer_id: z.string().min(1).describe("internal customer id") }),
    run: (input) =>
      traced("get_customer_profile", input, async () => {
        const c = await getCustomerDetail(ctx.storeId, input.customer_id);
        if (!c) return { error: "customer not found" };
        return {
          id: c.id,
          first_name: firstName(c),
          segment: c.segment,
          orders: c.ordersCount,
          ltv: money(c.ltvCents),
          average_order_value: money(c.avgTicketCents),
          days_since_last_purchase: c.daysSinceLastOrder,
          accepts_marketing: c.acceptsMarketing,
          last_orders: c.orders.slice(0, 10).map((o) => ({
            date: o.placedAt.toISOString().slice(0, 10),
            total: money(o.totalCents, o.currency),
            status: o.cancelled ? "cancelled" : o.financialStatus,
            items: o.items,
          })),
        };
      }),
  });

  const listAbandonedCheckoutsTool = betaZodTool({
    name: "list_abandoned_checkouts",
    description:
      "Most recent abandoned carts (checkouts never completed): customer id and first name (null " +
      "for guests), marketing consent, items, value and days since the cart was started. Use for " +
      "cart recovery questions.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(30).default(10).describe("Max carts (1-30)"),
    }),
    run: (input) =>
      traced("list_abandoned_checkouts", input, async () => {
        const now = Date.now();
        const rows = await listAbandonedCheckouts(ctx.storeId, input.limit);
        return {
          carts: rows.map((c) => ({
            customer_id: c.customerId,
            first_name: c.firstName,
            accepts_marketing: c.acceptsMarketing,
            items: c.items,
            value: money(c.totalCents, c.currency),
            days_since_started: Math.floor((now - c.startedAt.getTime()) / DAY_MS),
          })),
        };
      }),
  });

  return [
    getStoreOverviewTool,
    findCustomersTool,
    getCustomerProfileTool,
    listAbandonedCheckoutsTool,
  ];
}
