import Link from "next/link";
import { buttonStyles } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-sm font-semibold text-indigo-600">404</p>
      <h1 className="text-2xl font-semibold">Página não encontrada</h1>
      <Link href="/" className={buttonStyles.secondary}>
        Voltar ao painel
      </Link>
    </main>
  );
}
