import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCustomerDetail } from "@/lib/crm/queries";
import { getDictionary, isLocale, plural, t } from "@/lib/i18n";
import { formatDate, formatMoney } from "@/lib/i18n/format";
import { displayName, orderStatusLabel } from "@/lib/i18n/names";
import { getI18n } from "@/lib/i18n/server";
import { requireStoreContext } from "@/lib/stores/current";
import { Card, PageHeader, SegmentBadge, Skeleton, Stat, TextLink } from "@/components/ui";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/customers/[id]">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getDictionary(locale).customer.metaTitle } : {};
}

export default function CustomerPage({ params }: PageProps<"/[locale]/customers/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <CustomerDetail params={params} />
    </Suspense>
  );
}

async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const [{ store }, { locale, dict }, { id }] = await Promise.all([
    requireStoreContext(),
    getI18n(),
    params,
  ]);
  // Scoped to the current store: an id from another store is a 404.
  const c = await getCustomerDetail(store.id, id);
  if (!c) notFound();
  const d = dict.customer;

  return (
    <>
      <p className="mb-2 text-sm">
        <TextLink href="/customers">{d.back}</TextLink>
      </p>
      <PageHeader
        title={displayName(c, dict)}
        description={[c.email, c.phone].filter(Boolean).join(" · ") || undefined}
        actions={<SegmentBadge segment={c.segment} label={dict.segments[c.segment]} />}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={d.ltv} value={formatMoney(c.ltvCents, store.currency, locale)} />
        <Stat label={d.avgTicket} value={formatMoney(c.avgTicketCents, store.currency, locale)} />
        <Stat
          label={d.paidOrders}
          value={c.ordersCount}
          hint={t(d.firstOrder, { date: formatDate(c.firstOrderAt, locale) })}
        />
        <Stat
          label={d.lastOrder}
          value={
            c.daysSinceLastOrder === null ? "—" : plural(d.daysAgo, c.daysSinceLastOrder, locale)
          }
          hint={c.acceptsMarketing ? d.acceptsMarketing : d.noMarketing}
        />
      </div>

      <Card className="mt-6 overflow-x-auto p-0">
        <h2 className="px-5 pt-5 font-semibold">{d.orders}</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="border-y border-zinc-200 text-xs text-zinc-500 uppercase dark:border-zinc-800">
            <tr>
              <th scope="col" className="px-5 py-2 font-medium">
                {d.colOrder}
              </th>
              <th scope="col" className="px-5 py-2 font-medium">
                {d.colDate}
              </th>
              <th scope="col" className="px-5 py-2 font-medium">
                {d.colStatus}
              </th>
              <th scope="col" className="px-5 py-2 font-medium">
                {d.colItems}
              </th>
              <th scope="col" className="px-5 py-2 text-right font-medium">
                {d.colTotal}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {c.orders.map((o) => (
              <tr key={o.id}>
                <td className="px-5 py-2 font-medium">{o.name}</td>
                <td className="px-5 py-2 text-zinc-500">{formatDate(o.placedAt, locale)}</td>
                <td className="px-5 py-2">
                  {orderStatusLabel(o.financialStatus, o.cancelled, dict)}
                </td>
                <td
                  className="max-w-xs truncate px-5 py-2 text-zinc-500"
                  title={o.items.join(", ")}
                >
                  {o.items.join(", ") || "—"}
                </td>
                <td className="tabular px-5 py-2 text-right">
                  {formatMoney(o.totalCents, o.currency, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
