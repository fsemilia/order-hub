import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { getStoreOverview } from "@/lib/crm/queries";
import { SEGMENT_LABELS } from "@/lib/crm/segments";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/format";
import {
  Card,
  EmptyState,
  PageHeader,
  SegmentBadge,
  Skeleton,
  Stat,
  TextLink,
} from "@/components/ui";

export const metadata: Metadata = { title: "Visão geral" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Visão geral"
        description="Saúde da base de clientes, calculada a partir dos pedidos da Shopify."
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </>
  );
}

async function Dashboard() {
  await requireUser();
  const o = await getStoreOverview();

  if (o.customersTotal === 0) {
    return (
      <EmptyState title="Nenhum pedido recebido ainda">
        Conecte a loja Shopify (docs/shopify-setup.md) ou rode <code>npm run db:seed</code> para
        dados de demonstração.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Faturamento (30 dias)"
          value={formatCents(o.revenue30Cents)}
          hint={`${o.orders30} pedidos pagos`}
        />
        <Stat
          label="Faturamento (90 dias)"
          value={formatCents(o.revenue90Cents)}
          hint={`${o.orders90} pedidos pagos`}
        />
        <Stat
          label="Ticket médio"
          value={formatCents(o.avgTicketCents)}
          hint="todos os pedidos pagos"
        />
        <Stat
          label="Clientes"
          value={o.customersTotal}
          hint={`último webhook: ${formatDate(o.lastWebhookAt)}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="font-semibold">Segmentos</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Em risco = sem comprar há mais de {o.riskDays} dias.
          </p>
          <ul className="mt-4 space-y-3">
            {o.segments.map(({ segment, count }) => {
              const pct = o.customersTotal ? Math.round((count / o.customersTotal) * 100) : 0;
              return (
                <li key={segment}>
                  <div className="flex items-center justify-between text-sm">
                    <TextLink
                      href={`/customers?segment=${segment}`}
                      aria-label={`Ver clientes ${SEGMENT_LABELS[segment]}`}
                    >
                      <SegmentBadge segment={segment} />
                    </TextLink>
                    <span className="tabular text-zinc-500">
                      {count} · {pct}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <h2 className="font-semibold">Mais vendidos (90 dias)</h2>
          {o.topProducts90.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">Sem vendas no período.</p>
          ) : (
            <ol className="mt-4 space-y-2 text-sm">
              {o.topProducts90.map((p, i) => (
                <li key={p.title} className="flex justify-between gap-3">
                  <span className="truncate">
                    <span className="mr-2 text-zinc-400">{i + 1}.</span>
                    {p.title}
                  </span>
                  <span className="tabular shrink-0 text-zinc-500">{p.quantity} un.</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
