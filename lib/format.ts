const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});
const relFmt = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

export function formatDate(d: Date | null | undefined): string {
  return d ? dateFmt.format(d) : "—";
}

export function formatRelativeDays(d: Date | null | undefined, now: Date): string {
  if (!d) return "—";
  const days = Math.round((d.getTime() - now.getTime()) / 86_400_000);
  return relFmt.format(days, "day");
}
