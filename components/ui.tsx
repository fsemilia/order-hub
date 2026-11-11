import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { Segment } from "@/lib/crm/segments";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "rounded-xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900",
        className,
      )}
      {...props}
    />
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
        )}
      </div>
      {actions}
    </header>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <Card>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="tabular mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>}
    </Card>
  );
}

const SEGMENT_STYLES: Record<Segment, string> = {
  novo: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-950 dark:text-sky-300",
  recorrente:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300",
  em_risco: "bg-amber-50 text-amber-800 ring-amber-600/30 dark:bg-amber-950 dark:text-amber-300",
  sem_compras: "bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-300",
};

/** `label` comes from the dictionary (dict.segments[segment]). */
export function SegmentBadge({ segment, label }: { segment: Segment; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        SEGMENT_STYLES[segment],
      )}
    >
      {label}
    </span>
  );
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50";
export const buttonStyles = {
  primary: cn(buttonBase, "bg-indigo-600 text-white hover:bg-indigo-500"),
  secondary: cn(
    buttonBase,
    "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
  ),
  ghost: cn(
    buttonBase,
    "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
  ),
};

export const inputStyles =
  "block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-xs placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-lg bg-zinc-200/70 dark:bg-zinc-800", className)} />
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{children}</div>}
    </div>
  );
}

export function TextLink(props: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      className={cn(
        "font-medium text-indigo-600 hover:underline dark:text-indigo-400",
        props.className,
      )}
    />
  );
}

export function DemoBadge({ label }: { label: string }) {
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-amber-800 dark:bg-amber-950 dark:text-amber-300">
      {label}
    </span>
  );
}

const ORDER_STATUS_STYLES = {
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300",
  pending: "bg-amber-50 text-amber-800 ring-amber-600/30 dark:bg-amber-950 dark:text-amber-300",
  refunded: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-950 dark:text-sky-300",
  cancelled: "bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-300",
} as const;

/** `label` comes from the dictionary (dict.orders.statuses[status]). */
export function OrderStatusBadge({
  status,
  label,
}: {
  status: keyof typeof ORDER_STATUS_STYLES;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        ORDER_STATUS_STYLES[status],
      )}
    >
      {label}
    </span>
  );
}
