import type { Metadata } from "next";
import { Suspense } from "react";
import { env } from "@/lib/env";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { LoginForm } from "./login-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/login">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getDictionary(locale).login.submit } : {};
}

export default async function LoginPage() {
  const { dict } = await getI18n();
  const githubEnabled = Boolean(env().GITHUB_CLIENT_ID && env().GITHUB_CLIENT_SECRET);
  return (
    <main className="relative flex min-h-screen items-center justify-center px-4">
      <LanguageSwitcher className="absolute top-4 right-4" />
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold tracking-widest text-indigo-600 uppercase">
            {dict.common.appName}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{dict.login.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">{dict.login.subtitle}</p>
        </div>
        <Suspense>
          <LoginForm githubEnabled={githubEnabled} />
        </Suspense>
      </div>
    </main>
  );
}
