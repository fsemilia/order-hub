import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { isAgentConfigured, remainingQuota } from "@/lib/agent/run";
import { SUGGESTED_QUESTIONS } from "@/lib/agent/prompt";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { AgentPanel } from "./agent-panel";

export const metadata: Metadata = { title: "Agente IA" };

export default function AgentPage() {
  return (
    <>
      <PageHeader
        title="Agente de retenção"
        description="Pergunte em linguagem natural. O agente consulta o banco via ferramentas somente leitura e entrega rascunhos para você revisar."
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Agent />
      </Suspense>
    </>
  );
}

async function Agent() {
  const user = await requireUser();
  if (!isAgentConfigured()) {
    return (
      <EmptyState title="Agente não configurado">
        Defina <code>ANTHROPIC_API_KEY</code> nas variáveis de ambiente para habilitar o agente.
      </EmptyState>
    );
  }
  const quota = await remainingQuota(user.id);
  return <AgentPanel suggestions={SUGGESTED_QUESTIONS} initialQuota={quota} />;
}
