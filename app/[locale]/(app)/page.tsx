import type { Metadata } from "next";
import { Suspense } from "react";
import { getStoreOverview, listOrders } from "@/lib/crm/queries";
import { getDictionary, isLocale, plural, t } from "@/lib/i18n";
import { formatDate, formatDateTime, formatMoney } from "@/lib/i18n/format";
import { displayName } from "@/lib/i18n/names";
import { getI18n } from "@/lib/i18n/server";
import { requireStoreContext } from "@/lib/stores/current";
import { AutoRefresh } from "@/components/auto-refresh";
import {
  Card,
  EmptyState,
  OrderStatusBadge,
  PageHeader,
  SegmentBadge,
  Skeleton,
  Stat,
  TextLink,
} from "@/components/ui";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getDictionary(locale).dashboard.title } : {};
}

export default async function DashboardPage() {
  const { dict } = await getI18n();
  return (
    <>
      <PageHeader
        title={dict.dashboard.title}
        description={dict.dashboard.description}
        actions={<AutoRefresh />}
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </>
  );
}

async function Dashboard() {
  const [{ store }, { locale, dict }] = await Promise.all([requireStoreContext(), getI18n()]);
  const [o, recent] = await Promise.all([
    getStoreOverview(store.id),
    listOrders(store.id, { limit: 8 }),
  ]);
  const money = (cents: number) => formatMoney(cents, store.currency, locale);
  const d = dict.dashboard;

  if (o.customersTotal === 0 && o.abandoned7Count === 0) {
    return (
      <EmptyState title={d.emptyTitle}>
        {store.kind === "DEMO" ? (
          t(d.emptyDemo, { command: "npm run db:seed" })
        ) : (
          <>
            {d.emptyReal} <TextLink href="/stores">{dict.nav.stores}</TextLink>
          </>
        )}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          label={d.revenue30}
          value={money(o.revenue30Cents)}
          hint={plural(d.paidOrders, o.orders30, locale)}
        />
        <Stat
          label={d.revenue90}
          value={money(o.revenue90Cents)}
          hint={plural(d.paidOrders, o.orders90, locale)}
        />
        <Stat label={d.avgTicket} value={money(o.avgTicketCents)} hint={d.avgTicketHint} />
        <Stat
          label={d.customers}
          value={o.customersTotal}
          hint={t(d.lastWebhook, { date: formatDate(o.lastWebhookAt, locale) })}
        />
        <Stat
          label={d.abandoned7}
          value={money(o.abandoned7Cents)}
          hint={
            <TextLink href="/carts">{plural(d.abandoned7Hint, o.abandoned7Count, locale)}</TextLink>
          }
        />
      </div>

      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold">{d.recentOrders}</h2>
          <TextLink href="/orders" className="text-sm">
            {d.viewAllOrders}
          </TextLink>
        </div>
        {recent.rows.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">{d.noOrders}</p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            {recent.rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <span className="w-20 font-medium">{r.name}</span>
                <span className="w-36 text-zinc-500">{formatDateTime(r.placedAt, locale)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {r.customer ? (
                    <TextLink href={`/customers/${r.customer.id}`}>
                      {displayName(r.customer, dict)}
                    </TextLink>
                  ) : (
                    <span className="text-zinc-500">{dict.orders.guest}</span>
                  )}
                </span>
                <OrderStatusBadge status={r.status} label={dict.orders.statuses[r.status]} />
                <span className="tabular w-28 text-right font-medium">
                  {formatMoney(r.totalCents, r.currency, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="font-semibold">{d.segmentsTitle}</h2>
          <p className="mt-1 text-sm text-zinc-500">{t(d.segmentsHint, { days: o.riskDays })}</p>
          <ul className="mt-4 space-y-3">
            {o.segments.map(({ segment, count }) => {
              const pct = o.customersTotal ? Math.round((count / o.customersTotal) * 100) : 0;
              const label = dict.segments[segment];
              return (
                <li key={segment}>
                  <div className="flex items-center justify-between text-sm">
                    <TextLink
                      href={`/customers?segment=${segment}`}
                      aria-label={t(d.viewSegment, { segment: label })}
                    >
                      <SegmentBadge segment={segment} label={label} />
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
          <h2 className="font-semibold">{d.topProducts}</h2>
          {o.topProducts90.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">{d.noSales}</p>
          ) : (
            <ol className="mt-4 space-y-2 text-sm">
              {o.topProducts90.map((p, i) => (
                <li key={p.title} className="flex justify-between gap-3">
                  <span className="truncate">
                    <span className="mr-2 text-zinc-400">{i + 1}.</span>
                    {p.title}
                  </span>
                  <span className="tabular shrink-0 text-zinc-500">
                    {t(d.units, { count: p.quantity })}
                  </span>
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
