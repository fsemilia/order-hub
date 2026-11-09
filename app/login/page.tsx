import type { Metadata } from "next";
import { Suspense } from "react";
import { env } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  const githubEnabled = Boolean(env().GITHUB_CLIENT_ID && env().GITHUB_CLIENT_SECRET);
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold tracking-widest text-indigo-600 uppercase">
            Order Hub
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Entrar no painel</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Pedidos da Shopify, CRM e agente de retenção.
          </p>
        </div>
        <Suspense>
          <LoginForm githubEnabled={githubEnabled} />
        </Suspense>
      </div>
    </main>
  );
}
