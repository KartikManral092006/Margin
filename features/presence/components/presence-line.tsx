"use client";

import type { PlayerTimeStore } from "@/features/player/client/time-store";
import { usePlayer } from "@/features/player/client/use-player";
import {
  describeOthers,
  othersHere,
  type PresenceSnapshot,
} from "@/features/presence/shared/presence";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0]!, parts[parts.length - 1]!] : parts.slice(0, 1);
  return letters.map((part) => Array.from(part)[0]?.toUpperCase() ?? "").join("") || "?";
}

// "Ana, Ravi and 3 others are here" for the 30-second window I'm in, plus the room total.
export function PresenceLine({
  snapshot,
  store,
}: {
  snapshot: PresenceSnapshot | null;
  store: PlayerTimeStore;
}) {
  const slot = usePlayer(store, (s) => Math.floor(s.tSec / 30));
  const others = othersHere(snapshot, slot * 30);

  if (!snapshot) {
    return <p className="h-7 text-sm text-muted-foreground">Checking who&apos;s here…</p>;
  }

  return (
    <div className="flex min-h-7 flex-wrap items-center gap-2 text-sm" aria-live="polite">
      {others.names.length > 0 && (
        <span className="flex -space-x-2" aria-hidden>
          {others.names.slice(0, 4).map((name, i) => (
            <span
              key={`${name}-${i}`}
              title={name}
              className="flex size-7 items-center justify-center rounded-full border-2 border-background bg-sky-100 text-xs font-medium text-sky-900 dark:bg-sky-900 dark:text-sky-100"
            >
              {initials(name)}
            </span>
          ))}
        </span>
      )}
      <span className={others.count === 0 ? "text-muted-foreground" : ""}>
        {describeOthers(others)}
      </span>
      {snapshot.total > others.count && (
        <span className="text-muted-foreground">· {snapshot.total} watching this lecture</span>
      )}
    </div>
  );
}
