"use client";

import { useSyncExternalStore } from "react";
import type { PlayerSnapshot, PlayerTimeStore } from "@/features/player/client/time-store";

// `select` must return a primitive (or a stable reference), e.g. s => Math.floor(s.tSec), so a
// component re-renders only when its slice changes, not on every 250 ms poll.
export function usePlayer<T>(store: PlayerTimeStore, select: (snapshot: PlayerSnapshot) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.getSnapshot()),
    () => select(store.getServerSnapshot()),
  );
}
