"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const LINKS = [
  { href: "/", label: "Visão geral" },
  { href: "/customers", label: "Clientes" },
  { href: "/agent", label: "Agente IA" },
] as const;

export function NavLinks() {
  return <NavList pathname={usePathname()} />;
}

/** Same links without an active state: static fallback while the pathname streams in. */
export function NavLinksFallback() {
  return <NavList pathname={null} />;
}

function NavList({ pathname }: { pathname: string | null }) {
  return (
    <nav className="flex gap-1 text-sm">
      {LINKS.map(({ href, label }) => {
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
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
