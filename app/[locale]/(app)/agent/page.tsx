import type { Metadata } from "next";
import { Suspense } from "react";
import { isAgentConfigured, remainingQuota } from "@/lib/agent/run";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { requireStoreContext } from "@/lib/stores/current";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { AgentPanel } from "./agent-panel";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/agent">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getDictionary(locale).nav.agent } : {};
}

export default async function AgentPage() {
  const { dict } = await getI18n();
  return (
    <>
      <PageHeader title={dict.agent.title} description={dict.agent.description} />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Agent />
      </Suspense>
    </>
  );
}

async function Agent() {
  const [{ user, store }, { dict }] = await Promise.all([requireStoreContext(), getI18n()]);
  if (!isAgentConfigured()) {
    const [before, after] = dict.agent.notConfiguredHint.split("{key}");
    return (
      <EmptyState title={dict.agent.notConfiguredTitle}>
        {before}
        <code>ANTHROPIC_API_KEY</code>
        {after}
      </EmptyState>
    );
  }
  const quota = await remainingQuota(user.id);
  // key: switching store resets the panel (an answer about another store must not linger)
  return <AgentPanel key={store.id} initialQuota={quota} />;
}
