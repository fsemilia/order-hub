"use client";

import { buttonStyles } from "@/components/ui";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-xl font-semibold">Algo deu errado</h2>
      <p className="text-sm text-zinc-500">O erro foi registrado. Tente novamente.</p>
      <button onClick={reset} className={buttonStyles.secondary}>
        Tentar de novo
      </button>
    </div>
  );
}
