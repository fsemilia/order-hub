"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { authClient } from "@/lib/auth-client";
import { buttonStyles, Card, inputStyles } from "@/components/ui";

// Only allow same-site relative redirects (prevents open redirects via ?next=https://evil.com).
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function LoginForm({ githubEnabled }: { githubEnabled: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [error, setError] = useState<string | null>(
    params.get("error") ? "Acesso não autorizado." : null,
  );
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const { error } = await authClient.signIn.email({
        email: String(formData.get("email")),
        password: String(formData.get("password")),
      });
      if (error) {
        setError(
          error.status === 429
            ? "Muitas tentativas. Aguarde um minuto."
            : "E-mail ou senha inválidos.",
        );
        return;
      }
      router.replace(next);
      router.refresh();
    });
  }

  return (
    <Card className="space-y-4">
      <form action={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className={inputStyles}
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            Senha
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className={inputStyles}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending} className={`${buttonStyles.primary} w-full`}>
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>
      {githubEnabled && (
        <>
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" /> ou{" "}
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <button
            type="button"
            className={`${buttonStyles.secondary} w-full`}
            onClick={() =>
              authClient.signIn.social({
                provider: "github",
                callbackURL: next,
                errorCallbackURL: "/login?error=1",
              })
            }
          >
            Entrar com GitHub
          </button>
        </>
      )}
    </Card>
  );
}
