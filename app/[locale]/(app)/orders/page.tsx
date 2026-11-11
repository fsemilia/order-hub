import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { isOrderStatus, listOrders, ORDER_STATUSES } from "@/lib/crm/queries";
import { getDictionary, isLocale, plural, t } from "@/lib/i18n";
import { formatDateTime, formatMoney } from "@/lib/i18n/format";
import { displayName } from "@/lib/i18n/names";
import { getI18n } from "@/lib/i18n/server";
import { requireStoreContext } from "@/lib/stores/current";
import { AutoRefresh } from "@/components/auto-refresh";
import {
  buttonStyles,
  cn,
  EmptyState,
  inputStyles,
  OrderStatusBadge,
  PageHeader,
  Skeleton,
  TextLink,
} from "@/components/ui";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/orders">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getDictionary(locale).orders.title } : {};
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function parseParams(sp: Record<string, string | string[] | undefined>) {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const status = one("status");
  const page = Number(one("page") ?? 1);
  return {
    status: isOrderStatus(status) ? status : undefined,
    q: one("q")?.slice(0, 100),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export default async function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const { dict } = await getI18n();
  return (
    <>
      <PageHeader
        title={dict.orders.title}
        description={dict.orders.description}
        actions={<AutoRefresh />}
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <OrdersTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function OrdersTable({ searchParams }: { searchParams: SearchParams }) {
  const [{ store }, { locale, dict }] = await Promise.all([requireStoreContext(), getI18n()]);
  const params = parseParams(await searchParams);
  const { rows, total, page, pageCount } = await listOrders(store.id, params);
  const d = dict.orders;

  const href = (overrides: Record<string, string | number | undefined>) => {
    const merged = { status: params.status, q: params.q, page: params.page, ...overrides };
    const qs = new URLSearchParams(
      Object.entries(merged).filter(([, v]) => v !== undefined && v !== "") as [string, string][],
    );
    return `/orders?${qs}`;
  };

  return (
    <div className="space-y-4">
      {/* Plain GET form: filters live in the URL (shareable, back-button friendly, works without JS). */}
      <form className="flex flex-wrap items-end gap-3" role="search">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-zinc-500">
            {d.search}
          </label>
          <input
            id="q"
            name="q"
            defaultValue={params.q}
            placeholder={d.searchPlaceholder}
            className={inputStyles}
          />
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-xs font-medium text-zinc-500">
            {d.status}
          </label>
          <select
            id="status"
            name="status"
            defaultValue={params.status ?? ""}
            className={inputStyles}
          >
            <option value="">{d.all}</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {d.statuses[s]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={buttonStyles.secondary}>
          {d.filter}
        </button>
      </form>

      <p className="text-sm text-zinc-500" aria-live="polite">
        {plural(d.count, total, locale)}
      </p>

      {rows.length === 0 ? (
        <EmptyState title={d.emptyTitle}>{d.emptyHint}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs text-zinc-500 uppercase dark:border-zinc-800">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  {d.colOrder}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {d.colDate}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {d.colCustomer}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {d.colStatus}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {d.colItems}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  {d.colTotal}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((o) => (
                <tr key={o.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{o.name}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-zinc-500">
                    {formatDateTime(o.placedAt, locale)}
                  </td>
                  <td className="px-4 py-3">
                    {o.customer ? (
                      <TextLink href={`/customers/${o.customer.id}`}>
                        {displayName(o.customer, dict)}
                      </TextLink>
                    ) : (
                      <span className="text-zinc-500">{d.guest}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={o.status} label={d.statuses[o.status]} />
                  </td>
                  <td
                    className="max-w-xs truncate px-4 py-3 text-zinc-500"
                    title={o.items.join(", ")}
                  >
                    {o.items.join(", ") || "—"}
                  </td>
                  <td className="tabular px-4 py-3 text-right font-medium whitespace-nowrap">
                    {formatMoney(o.totalCents, o.currency, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <nav
          className="flex items-center justify-between text-sm"
          aria-label={dict.customers.pagination}
        >
          <Link
            href={href({ page: page - 1 })}
            aria-disabled={page <= 1}
            className={cn(buttonStyles.secondary, page <= 1 && "pointer-events-none opacity-50")}
          >
            {dict.customers.previous}
          </Link>
          <span className="tabular text-zinc-500">
            {t(dict.customers.pageOf, { page, count: pageCount })}
          </span>
          <Link
            href={href({ page: page + 1 })}
            aria-disabled={page >= pageCount}
            className={cn(
              buttonStyles.secondary,
              page >= pageCount && "pointer-events-none opacity-50",
            )}
          >
            {dict.customers.next}
          </Link>
        </nav>
      )}
    </div>
  );
}
