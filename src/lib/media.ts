"use client";

import { useCallback, useSyncExternalStore } from "react";

/** True once the viewport matches. False during SSR and before hydration. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  const get = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, get, () => false);
}

/** §5.4 — below roughly 1100px the columns no longer fit side by side. */
export function useNarrow(): boolean {
  return useMediaQuery("(max-width: 1100px)");
}
