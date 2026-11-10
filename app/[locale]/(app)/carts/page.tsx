import type { Metadata } from "next";
import { Suspense } from "react";
import { listAbandonedCheckouts } from "@/lib/crm/queries";
import { getDictionary, isLocale } from "@/lib/i18n";
import { formatDateTime, formatMoney } from "@/lib/i18n/format";
import { getI18n } from "@/lib/i18n/server";
import { requireStoreContext } from "@/lib/stores/current";
import { EmptyState, PageHeader, Skeleton, TextLink } from "@/components/ui";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/carts">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getDictionary(locale).carts.title } : {};
}

export default async function CartsPage() {
  const { dict } = await getI18n();
  return (
    <>
      <PageHeader title={dict.carts.title} description={dict.carts.description} />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <CartsTable />
      </Suspense>
    </>
  );
}

async function CartsTable() {
  const [{ store }, { locale, dict }] = await Promise.all([requireStoreContext(), getI18n()]);
  const rows = await listAbandonedCheckouts(store.id);
  const d = dict.carts;

  if (rows.length === 0) return <EmptyState title={d.emptyTitle}>{d.emptyHint}</EmptyState>;

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-200 text-xs text-zinc-500 uppercase dark:border-zinc-800">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              {d.colCustomer}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {d.colItems}
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              {d.colValue}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {d.colStarted}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {d.colRecovery}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((c) => (
            <tr key={c.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
              <td className="px-4 py-3">
                {c.customerId ? (
                  <TextLink href={`/customers/${c.customerId}`}>
                    {c.firstName ?? dict.common.noName}
                  </TextLink>
                ) : (
                  <span className="font-medium">{d.guest}</span>
                )}
                <p className="text-xs text-zinc-500">
                  {c.email ?? "—"} · {c.acceptsMarketing ? d.consent : d.noConsent}
                </p>
              </td>
              <td className="max-w-xs truncate px-4 py-3 text-zinc-500" title={c.items.join(", ")}>
                {c.items.join(", ") || "—"}
              </td>
              <td className="tabular px-4 py-3 text-right font-medium">
                {formatMoney(c.totalCents, c.currency, locale)}
              </td>
              <td className="px-4 py-3 text-zinc-500">{formatDateTime(c.startedAt, locale)}</td>
              <td className="px-4 py-3">
                {c.recoveryUrl ? (
                  <a
                    href={c.recoveryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    {d.openLink}
                  </a>
                ) : (
                  d.noLink
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
