import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/session";
import { getI18n } from "@/lib/i18n/server";
import { getCurrentStore } from "@/lib/stores/current";
import { listStores } from "@/lib/stores/stores";
import { buttonStyles, Skeleton } from "@/components/ui";
import { LanguageSwitcher } from "@/components/language-switcher";
import { NavLinks, NavLinksFallback } from "./nav-links";
import { StoreSelect } from "./store-select";
import { signOut } from "./actions";

export default async function AppLayout({ children }: LayoutProps<"/[locale]">) {
  const { dict } = await getI18n();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2">
          <Link
            href="/"
            className="text-sm font-semibold tracking-widest text-indigo-600 uppercase"
          >
            {dict.common.appName}
          </Link>
          <Suspense fallback={<NavLinksFallback />}>
            <NavLinks />
          </Suspense>
          <div className="ml-auto flex items-center gap-3">
            {/* Session and store are request-time data: stream them in, keep the shell static. */}
            <Suspense fallback={<Skeleton className="h-8 w-40" />}>
              <StoreMenu />
            </Suspense>
            <LanguageSwitcher />
            <Suspense fallback={<Skeleton className="h-8 w-20" />}>
              <UserMenu label={dict.common.signOut} />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}

async function StoreMenu() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [stores, current] = await Promise.all([listStores(), getCurrentStore()]);
  return <StoreSelect stores={stores} currentId={current.id} />;
}

async function UserMenu({ label }: { label: string }) {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <form action={signOut} className="flex items-center gap-3">
      <span className="hidden text-sm text-zinc-500 lg:inline">{user.email}</span>
      <button type="submit" className={buttonStyles.ghost}>
        {label}
      </button>
    </form>
  );
}
