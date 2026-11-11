"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useI18n } from "./i18n-provider";

/**
 * Re-renders the current page's server data every `seconds` while the tab is visible, so orders
 * arriving through webhooks show up without a manual reload. router.refresh() keeps client state
 * (scroll, form inputs) and only re-fetches the RSC payload.
 */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  const { dict } = useI18n();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500" aria-live="off">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      {dict.common.live}
    </span>
  );
}
