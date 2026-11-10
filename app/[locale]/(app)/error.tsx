"use client";

import { useI18n } from "@/components/i18n-provider";
import { buttonStyles } from "@/components/ui";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { dict } = useI18n();
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-xl font-semibold">{dict.errors.title}</h2>
      <p className="text-sm text-zinc-500">{dict.errors.hint}</p>
      <button onClick={reset} className={buttonStyles.secondary}>
        {dict.errors.retry}
      </button>
    </div>
  );
}
