"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False in the server HTML and until React has hydrated this component, then true.
 *
 * Controls whose effect lives in an event handler (language, store, data-source toggle) are
 * disabled until then: a choice made before hydration would be silently lost (the handler is not
 * attached yet, and React resets the control to its state when it attaches).
 */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
