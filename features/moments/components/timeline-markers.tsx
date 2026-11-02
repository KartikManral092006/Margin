"use client";

import type { PlayerTimeStore } from "@/features/player/client/time-store";
import { usePlayer } from "@/features/player/client/use-player";
import { formatClock } from "@/features/player/shared/format";
import type { Markers } from "@/features/moments/client/use-room-moments";

// A bar under the player (never over it) showing where doubts cluster across the whole
// lecture. Each marker is a button: clicking it seeks there, which loads that window's doubts.
export function TimelineMarkers({
  markers,
  store,
}: {
  markers: Markers | null;
  store: PlayerTimeStore;
}) {
  const duration = usePlayer(store, (s) => s.duration);
  // Rounded to 0.5 % so the playhead re-renders this bar a few hundred times per video at most.
  const progress = usePlayer(store, (s) =>
    s.duration ? Math.round((s.tSec / s.duration) * 200) / 2 : 0,
  );
  if (!duration || !markers) return null;

  const buckets = markers.buckets.filter((bucket) => bucket.tSec <= duration);
  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));

  return (
    <div className="px-4 sm:px-0">
      <div
        role="group"
        aria-label={`Doubts across the lecture: ${buckets.length} places`}
        className="relative h-8 w-full rounded-md bg-muted"
      >
        <div
          aria-hidden
          className="absolute inset-y-0 w-0.5 bg-foreground/60"
          style={{ left: `${progress}%` }}
        />
        {buckets.map((bucket) => {
          const left = (bucket.tSec / duration) * 100;
          const height = 30 + (bucket.count / maxCount) * 70;
          const label = `${bucket.count} ${bucket.count === 1 ? "doubt" : "doubts"} at ${formatClock(bucket.tSec)}`;
          return (
            <button
              key={bucket.tSec}
              type="button"
              title={label}
              aria-label={label}
              onClick={() => store.seek(bucket.tSec)}
              // A 12 px wide hit area around a thin visible mark.
              className="group absolute inset-y-0 flex w-3 -translate-x-1/2 items-end justify-center focus-visible:outline-2"
              style={{ left: `${left}%` }}
            >
              <span
                className="w-1 rounded-sm bg-amber-500 group-hover:bg-amber-600"
                style={{ height: `${height}%` }}
              />
            </button>
          );
        })}
      </div>
      {buckets.length === 0 && (
        <p className="mt-1 text-xs text-muted-foreground">No doubts in this lecture yet.</p>
      )}
    </div>
  );
}
