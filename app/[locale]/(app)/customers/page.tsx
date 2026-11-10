import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { listCustomers } from "@/lib/crm/queries";
import { isSegment, SEGMENTS } from "@/lib/crm/segments";
import { getDictionary, isLocale, plural, t } from "@/lib/i18n";
import { formatMoney, formatRelativeDays } from "@/lib/i18n/format";
import { displayName } from "@/lib/i18n/names";
import { getI18n } from "@/lib/i18n/server";
import { requireStoreContext } from "@/lib/stores/current";
import {
  buttonStyles,
  cn,
  EmptyState,
  inputStyles,
  PageHeader,
  SegmentBadge,
  Skeleton,
} from "@/components/ui";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getDictionary(locale).customers.title } : {};
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function parseParams(sp: Record<string, string | string[] | undefined>) {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const segment = one("segment");
  const page = Number(one("page") ?? 1);
  return {
    segment: isSegment(segment) ? segment : undefined,
    q: one("q")?.slice(0, 100),
    page: Number.isInteger(page) && page > 0 ? page : 1,
    sort: one("sort") === "recent" ? ("recent" as const) : ("ltv" as const),
  };
}

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const { dict } = await getI18n();
  return (
    <>
      <PageHeader title={dict.customers.title} description={dict.customers.description} />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <CustomersTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function CustomersTable({ searchParams }: { searchParams: SearchParams }) {
  const [{ store }, { locale, dict }] = await Promise.all([requireStoreContext(), getI18n()]);
  const params = parseParams(await searchParams);
  const now = new Date();
  const { rows, total, page, pageCount } = await listCustomers(store.id, params, now);
  const money = (cents: number) => formatMoney(cents, store.currency, locale);
  const d = dict.customers;

  const href = (overrides: Record<string, string | number | undefined>) => {
    const merged = {
      segment: params.segment,
      q: params.q,
      sort: params.sort,
      page: params.page,
      ...overrides,
    };
    const qs = new URLSearchParams(
      Object.entries(merged).filter(([, v]) => v !== undefined && v !== "") as [string, string][],
    );
    return `/customers?${qs}`;
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
          <label htmlFor="segment" className="mb-1 block text-xs font-medium text-zinc-500">
            {d.segment}
          </label>
          <select
            id="segment"
            name="segment"
            defaultValue={params.segment ?? ""}
            className={inputStyles}
          >
            <option value="">{d.all}</option>
            {SEGMENTS.map((s) => (
              <option key={s} value={s}>
                {dict.segments[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sort" className="mb-1 block text-xs font-medium text-zinc-500">
            {d.sortBy}
          </label>
          <select id="sort" name="sort" defaultValue={params.sort} className={inputStyles}>
            <option value="ltv">{d.sortLtv}</option>
            <option value="recent">{d.sortRecent}</option>
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
                  {d.colCustomer}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {d.colSegment}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  {d.colOrders}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  {d.colLtv}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  {d.colAvgTicket}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {d.colLastOrder}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-4 py-3">
                    <Link href={`/customers/${c.id}`} className="font-medium hover:underline">
                      {displayName(c, dict)}
                    </Link>
                    <p className="text-xs text-zinc-500">{c.email ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <SegmentBadge segment={c.segment} label={dict.segments[c.segment]} />
                  </td>
                  <td className="tabular px-4 py-3 text-right">{c.ordersCount}</td>
                  <td className="tabular px-4 py-3 text-right font-medium">{money(c.ltvCents)}</td>
                  <td className="tabular px-4 py-3 text-right">{money(c.avgTicketCents)}</td>
                  <td className="px-4 py-3 text-zinc-500">
                    {formatRelativeDays(c.lastOrderAt, now, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label={d.pagination}>
          <Link
            href={href({ page: page - 1 })}
            aria-disabled={page <= 1}
            className={cn(buttonStyles.secondary, page <= 1 && "pointer-events-none opacity-50")}
          >
            {d.previous}
          </Link>
          <span className="tabular text-zinc-500">{t(d.pageOf, { page, count: pageCount })}</span>
          <Link
            href={href({ page: page + 1 })}
            aria-disabled={page >= pageCount}
            className={cn(
              buttonStyles.secondary,
              page >= pageCount && "pointer-events-none opacity-50",
            )}
          >
            {d.next}
          </Link>
        </nav>
      )}
    </div>
  );
}
