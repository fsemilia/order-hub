import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/session";
import { buttonStyles, Skeleton } from "@/components/ui";
import { NavLinks, NavLinksFallback } from "./nav-links";
import { signOut } from "./actions";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link
            href="/"
            className="text-sm font-semibold tracking-widest text-indigo-600 uppercase"
          >
            Order Hub
          </Link>
          <Suspense fallback={<NavLinksFallback />}>
            <NavLinks />
          </Suspense>
          <div className="ml-auto">
            {/* The session read is request-time data: stream it in, keep the shell static. */}
            <Suspense fallback={<Skeleton className="h-8 w-32" />}>
              <UserMenu />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}

async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <form action={signOut} className="flex items-center gap-3">
      <span className="hidden text-sm text-zinc-500 sm:inline">{user.email}</span>
      <button type="submit" className={buttonStyles.ghost}>
        Sair
      </button>
    </form>
  );
}
