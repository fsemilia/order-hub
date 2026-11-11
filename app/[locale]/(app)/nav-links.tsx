"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import type { Dictionary } from "@/lib/i18n";
import { cn } from "@/components/ui";

const LINKS: { href: string; key: keyof Dictionary["nav"] }[] = [
  { href: "/", key: "overview" },
  { href: "/orders", key: "orders" },
  { href: "/customers", key: "customers" },
  { href: "/carts", key: "carts" },
  { href: "/agent", key: "agent" },
  { href: "/stores", key: "stores" },
];

export function NavLinks() {
  return <NavList pathname={usePathname()} />;
}

/** Same links without an active state: static fallback while the pathname streams in. */
export function NavLinksFallback() {
  return <NavList pathname={null} />;
}

function NavList({ pathname }: { pathname: string | null }) {
  const { dict } = useI18n();
  return (
    <nav className="flex flex-wrap gap-1 text-sm">
      {LINKS.map(({ href, key }) => {
        const active = href === "/" ? pathname === "/" : !!pathname?.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 transition",
              active
                ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-white"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white",
            )}
          >
            {dict.nav[key]}
          </Link>
        );
      })}
    </nav>
  );
}
