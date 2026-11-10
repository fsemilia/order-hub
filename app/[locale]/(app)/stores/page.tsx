import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { getDictionary, isLocale, type Dictionary, type Locale } from "@/lib/i18n";
import { formatDateTime } from "@/lib/i18n/format";
import { getI18n } from "@/lib/i18n/server";
import { requireStoreContext } from "@/lib/stores/current";
import { listStores, storeStats, WEBHOOK_TOPICS, type StoreSummary } from "@/lib/stores/stores";
import { Card, DemoBadge, PageHeader, Skeleton } from "@/components/ui";
import { AddStoreForm, OpenStoreButton, RemoveStoreButton, RotateSecretForm } from "./store-forms";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/stores">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getDictionary(locale).stores.title } : {};
}

export default async function StoresPage() {
  const { dict } = await getI18n();
  return (
    <>
      <PageHeader title={dict.stores.title} description={dict.stores.description} />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Stores />
      </Suspense>
    </>
  );
}

async function webhookUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/api/webhooks/shopify`;
}

async function Stores() {
  const [{ store: current }, { locale, dict }] = await Promise.all([
    requireStoreContext(),
    getI18n(),
  ]);
  const [stores, stats, url] = await Promise.all([listStores(), storeStats(), webhookUrl()]);
  const s = dict.stores;

  return (
    <div className="space-y-6">
      {stores.map((store) => (
        <StoreCard
          key={store.id}
          store={store}
          current={store.id === current.id}
          counts={{
            customers: stats.customers.get(store.id)?._count._all ?? 0,
            orders: stats.orders.get(store.id)?._count._all ?? 0,
            abandoned: stats.abandoned.get(store.id)?._count._all ?? 0,
            lastWebhook: stats.lastWebhook.get(store.id)?._max.receivedAt ?? null,
          }}
          webhookUrl={url}
          dict={dict}
          locale={locale}
        />
      ))}

      <Card>
        <h2 className="font-semibold">{s.addTitle}</h2>
        <p className="mt-1 mb-4 text-sm text-zinc-500">{s.addHint}</p>
        <AddStoreForm />
      </Card>
    </div>
  );
}

function StoreCard({
  store,
  current,
  counts,
  webhookUrl,
  dict,
  locale,
}: {
  store: StoreSummary;
  current: boolean;
  counts: { customers: number; orders: number; abandoned: number; lastWebhook: Date | null };
  webhookUrl: string;
  dict: Dictionary;
  locale: Locale;
}) {
  const s = dict.stores;
  const isDemo = store.kind === "DEMO";
  return (
    <Card className="space-y-4" data-testid={`store-${store.id}`}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">{store.name}</h2>
        {isDemo && <DemoBadge label={dict.common.demoBadge} />}
        {store.shopDomain && <code className="text-xs text-zinc-500">{store.shopDomain}</code>}
        <span className="text-xs text-zinc-500">{store.currency}</span>
        {current && (
          <span className="ml-auto rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            {s.current}
          </span>
        )}
      </div>
      {isDemo && <p className="text-sm text-zinc-500">{s.demoHint}</p>}

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {(
          [
            [s.customers, counts.customers],
            [s.orders, counts.orders],
            [s.abandoned, counts.abandoned],
            [
              s.lastWebhook,
              counts.lastWebhook ? formatDateTime(counts.lastWebhook, locale) : s.never,
            ],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-zinc-500">{label}</dt>
            <dd className="tabular font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      {!isDemo && (
        <div className="grid gap-4 border-t border-zinc-100 pt-4 lg:grid-cols-2 dark:border-zinc-800">
          <div className="space-y-2 text-sm">
            <p className="text-xs font-medium text-zinc-500">{s.webhookUrl}</p>
            <code className="block rounded bg-zinc-100 px-2 py-1 text-xs break-all dark:bg-zinc-800">
              {webhookUrl}
            </code>
            <p className="text-xs font-medium text-zinc-500">{s.topics}</p>
            <ul className="flex flex-wrap gap-1">
              {WEBHOOK_TOPICS.map((topic) => (
                <li
                  key={topic}
                  className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800"
                >
                  {topic}
                </li>
              ))}
            </ul>
          </div>
          <RotateSecretForm storeId={store.id} />
        </div>
      )}

      <div className="flex justify-end gap-2">
        {!isDemo && <RemoveStoreButton storeId={store.id} name={store.name} />}
        {!current && <OpenStoreButton storeId={store.id} label={s.use} />}
      </div>
    </Card>
  );
}
