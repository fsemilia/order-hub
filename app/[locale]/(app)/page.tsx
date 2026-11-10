import type { Metadata } from "next";
import { Suspense } from "react";
import { getStoreOverview } from "@/lib/crm/queries";
import { getDictionary, isLocale, plural, t } from "@/lib/i18n";
import { formatDate, formatMoney } from "@/lib/i18n/format";
import { getI18n } from "@/lib/i18n/server";
import { requireStoreContext } from "@/lib/stores/current";
import {
  Card,
  EmptyState,
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
      <PageHeader title={dict.dashboard.title} description={dict.dashboard.description} />
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </>
  );
}

async function Dashboard() {
  const [{ store }, { locale, dict }] = await Promise.all([requireStoreContext(), getI18n()]);
  const o = await getStoreOverview(store.id);
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
