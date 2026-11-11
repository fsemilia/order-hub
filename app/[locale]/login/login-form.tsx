"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/components/i18n-provider";
import { buttonStyles, Card, cn, inputStyles } from "@/components/ui";
import { useHydrated } from "@/components/use-hydrated";
import { chooseDataSource } from "../preferences";

type DataSource = "demo" | "real";

// Only allow same-site relative redirects (prevents open redirects via ?next=https://evil.com).
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function LoginForm({ githubEnabled }: { githubEnabled: boolean }) {
  const { dict } = useI18n();
  const l = dict.login;
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [source, setSource] = useState<DataSource>("demo");
  const [error, setError] = useState<string | null>(params.get("error") ? l.unauthorized : null);
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const { error } = await authClient.signIn.email({
        email: String(formData.get("email")),
        password: String(formData.get("password")),
      });
      if (error) {
        setError(error.status === 429 ? l.tooManyAttempts : l.invalidCredentials);
        return;
      }
      // Now authenticated: the server picks the store (demo, or the first real one).
      const { redirectTo } = await chooseDataSource(source);
      router.replace(redirectTo ?? next);
      router.refresh();
    });
  }

  const options: { value: DataSource; label: string; hint: string }[] = [
    { value: "demo", label: l.dataDemo, hint: l.dataDemoHint },
    { value: "real", label: l.dataReal, hint: l.dataRealHint },
  ];

  return (
    <Card className="space-y-4">
      <form action={onSubmit} className="space-y-4">
        <fieldset>
          <legend className="mb-1 block text-sm font-medium">{l.dataSource}</legend>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
            {options.map((o) => (
              <label
                key={o.value}
                title={o.hint}
                className={cn(
                  "cursor-pointer rounded-md px-3 py-1.5 text-center text-sm transition",
                  source === o.value
                    ? "bg-white font-medium shadow-xs dark:bg-zinc-950"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white",
                )}
              >
                <input
                  type="radio"
                  name="source"
                  value={o.value}
                  checked={source === o.value}
                  disabled={!hydrated}
                  onChange={() => setSource(o.value)}
                  className="sr-only"
                />
                {o.label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {options.find((o) => o.value === source)?.hint}
          </p>
        </fieldset>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            {l.email}
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
            {l.password}
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
        {/* Disabled until hydrated: the action is a client function, a click before it is lost */}
        <button
          type="submit"
          disabled={pending || !hydrated}
          className={`${buttonStyles.primary} w-full`}
        >
          {pending ? l.submitting : l.submit}
        </button>
      </form>
      {githubEnabled && (
        <>
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" /> {l.or}{" "}
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <button
            type="button"
            disabled={!hydrated}
            className={`${buttonStyles.secondary} w-full`}
            onClick={() =>
              authClient.signIn.social({
                provider: "github",
                // Social sign-in leaves the page: the store stays the last one used (default demo).
                callbackURL: next,
                errorCallbackURL: "/login?error=1",
              })
            }
          >
            {l.github}
          </button>
        </>
      )}
    </Card>
  );
}
