import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { getCustomerDetail } from "@/lib/crm/queries";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { Card, PageHeader, SegmentBadge, Skeleton, Stat, TextLink } from "@/components/ui";

export const metadata: Metadata = { title: "Cliente" };

export default function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <CustomerDetail params={params} />
    </Suspense>
  );
}

async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const c = await getCustomerDetail(id);
  if (!c) notFound();

  return (
    <>
      <p className="mb-2 text-sm">
        <TextLink href="/customers">← Clientes</TextLink>
      </p>
      <PageHeader
        title={c.name}
        description={[c.email, c.phone].filter(Boolean).join(" · ") || undefined}
        actions={<SegmentBadge segment={c.segment} />}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="LTV" value={formatCents(c.ltvCents)} />
        <Stat label="Ticket médio" value={formatCents(c.avgTicketCents)} />
        <Stat
          label="Pedidos pagos"
          value={c.ordersCount}
          hint={`primeira compra: ${formatDate(c.firstOrderAt)}`}
        />
        <Stat
          label="Última compra"
          value={c.daysSinceLastOrder === null ? "—" : `há ${c.daysSinceLastOrder} dias`}
          hint={c.acceptsMarketing ? "aceita marketing" : "sem consentimento de marketing"}
        />
      </div>

      <Card className="mt-6 p-0">
        <h2 className="px-5 pt-5 font-semibold">Pedidos</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="border-y border-zinc-200 text-xs text-zinc-500 uppercase dark:border-zinc-800">
            <tr>
              <th scope="col" className="px-5 py-2 font-medium">
                Pedido
              </th>
              <th scope="col" className="px-5 py-2 font-medium">
                Data
              </th>
              <th scope="col" className="px-5 py-2 font-medium">
                Status
              </th>
              <th scope="col" className="px-5 py-2 font-medium">
                Itens
              </th>
              <th scope="col" className="px-5 py-2 text-right font-medium">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {c.orders.map((o) => (
              <tr key={o.id}>
                <td className="px-5 py-2 font-medium">{o.name}</td>
                <td className="px-5 py-2 text-zinc-500">{formatDate(o.placedAt)}</td>
                <td className="px-5 py-2">{o.cancelled ? "cancelado" : o.financialStatus}</td>
                <td
                  className="max-w-xs truncate px-5 py-2 text-zinc-500"
                  title={o.items.join(", ")}
                >
                  {o.items.join(", ") || "—"}
                </td>
                <td className="tabular px-5 py-2 text-right">
                  {formatCents(o.totalCents, o.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
