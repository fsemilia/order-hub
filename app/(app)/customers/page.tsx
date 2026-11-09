import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { listCustomers } from "@/lib/crm/queries";
import { isSegment, SEGMENT_LABELS, SEGMENTS } from "@/lib/crm/segments";
import { formatCents } from "@/lib/money";
import { formatRelativeDays } from "@/lib/format";
import {
  buttonStyles,
  cn,
  EmptyState,
  inputStyles,
  PageHeader,
  SegmentBadge,
  Skeleton,
} from "@/components/ui";

export const metadata: Metadata = { title: "Clientes" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function parseParams(sp: Record<string, string | string[] | undefined>) {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const segment = one("segment");
  const page = Number(one("page") ?? 1);
  return {
    segment: isSegment(segment) ? segment : undefined,
    q: one("q")?.slice(0, 100),
    page: Number.isInteger(page) && page > 0 ? page : 1,
    sort: one("sort") === "recent" ? ("recent" as const) : ("ltv" as const),
  };
}

export default function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader
        title="Clientes"
        description="LTV, ticket médio e segmento calculados a partir dos pedidos pagos."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <CustomersTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function CustomersTable({ searchParams }: { searchParams: SearchParams }) {
  await requireUser();
  const params = parseParams(await searchParams);
  const now = new Date();
  const { rows, total, page, pageCount } = await listCustomers(params, now);

  const href = (overrides: Record<string, string | number | undefined>) => {
    const merged = {
      segment: params.segment,
      q: params.q,
      sort: params.sort,
      page: params.page,
      ...overrides,
    };
    const qs = new URLSearchParams(
      Object.entries(merged).filter(([, v]) => v !== undefined && v !== "") as [string, string][],
    );
    return `/customers?${qs}`;
  };

  return (
    <div className="space-y-4">
      {/* Plain GET form: filters live in the URL (shareable, back-button friendly, works without JS). */}
      <form className="flex flex-wrap items-end gap-3" role="search">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-zinc-500">
            Buscar
          </label>
          <input
            id="q"
            name="q"
            defaultValue={params.q}
            placeholder="Nome ou e-mail"
            className={inputStyles}
          />
        </div>
        <div>
          <label htmlFor="segment" className="mb-1 block text-xs font-medium text-zinc-500">
            Segmento
          </label>
          <select
            id="segment"
            name="segment"
            defaultValue={params.segment ?? ""}
            className={inputStyles}
          >
            <option value="">Todos</option>
            {SEGMENTS.map((s) => (
              <option key={s} value={s}>
                {SEGMENT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sort" className="mb-1 block text-xs font-medium text-zinc-500">
            Ordenar por
          </label>
          <select id="sort" name="sort" defaultValue={params.sort} className={inputStyles}>
            <option value="ltv">Maior LTV</option>
            <option value="recent">Compra mais recente</option>
          </select>
        </div>
        <button type="submit" className={buttonStyles.secondary}>
          Filtrar
        </button>
      </form>

      <p className="text-sm text-zinc-500" aria-live="polite">
        {total} {total === 1 ? "cliente" : "clientes"}
      </p>

      {rows.length === 0 ? (
        <EmptyState title="Nenhum cliente encontrado">Ajuste os filtros ou a busca.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs text-zinc-500 uppercase dark:border-zinc-800">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Cliente
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Segmento
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Pedidos
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  LTV
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Ticket médio
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Última compra
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-4 py-3">
                    <Link href={`/customers/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    <p className="text-xs text-zinc-500">{c.email ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <SegmentBadge segment={c.segment} />
                  </td>
                  <td className="tabular px-4 py-3 text-right">{c.ordersCount}</td>
                  <td className="tabular px-4 py-3 text-right font-medium">
                    {formatCents(c.ltvCents)}
                  </td>
                  <td className="tabular px-4 py-3 text-right">{formatCents(c.avgTicketCents)}</td>
                  <td className="px-4 py-3 text-zinc-500">
                    {formatRelativeDays(c.lastOrderAt, now)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Paginação">
          <Link
            href={href({ page: page - 1 })}
            aria-disabled={page <= 1}
            className={cn(buttonStyles.secondary, page <= 1 && "pointer-events-none opacity-50")}
          >
            Anterior
          </Link>
          <span className="tabular text-zinc-500">
            Página {page} de {pageCount}
          </span>
          <Link
            href={href({ page: page + 1 })}
            aria-disabled={page >= pageCount}
            className={cn(
              buttonStyles.secondary,
              page >= pageCount && "pointer-events-none opacity-50",
            )}
          >
            Próxima
          </Link>
        </nav>
      )}
    </div>
  );
}
