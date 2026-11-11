import type { Metadata } from "next";
import { Suspense } from "react";
import { getAgentKeyStatus } from "@/lib/agent/credentials";
import { remainingQuota } from "@/lib/agent/run";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { requireStoreContext } from "@/lib/stores/current";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { AgentPanel } from "./agent-panel";
import { AgentKeyCard } from "./key-form";

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
  const status = await getAgentKeyStatus(user);
  // The daily quota only guards the operator key; with their own key users are not limited.
  const quota = status.source === "owner" ? await remainingQuota(user.id) : null;
  return (
    <div className="space-y-6">
      {status.source === "none" ? (
        <EmptyState title={dict.agent.noKeyTitle}>{dict.agent.noKeyHint}</EmptyState>
      ) : (
        // key: switching store resets the panel (an answer about another store must not linger)
        <AgentPanel key={store.id} initialQuota={quota} />
      )}
      {/* key: remount when the stored key changes, so stale form feedback disappears */}
      <AgentKeyCard key={status.source === "user" ? status.hint : status.source} status={status} />
    </div>
  );
}
