"use client";

import { heatLevels, type HeatBucket } from "@/features/heatmap/shared/heatmap";
import type { PlayerTimeStore } from "@/features/player/client/time-store";
import { usePlayer } from "@/features/player/client/use-player";
import { formatClock } from "@/features/player/shared/format";
import type { Markers } from "@/features/moments/client/use-room-moments";

// A bar under the player (never over it) showing where doubts cluster across the whole
// lecture, over a heatmap of where people got lost (redder = more people). Each marker is a
// button: clicking it seeks there, which loads that window's doubts.
export function TimelineMarkers({
  markers,
  heat = [],
  store,
}: {
  markers: Markers | null;
  heat?: HeatBucket[];
  store: PlayerTimeStore;
}) {
  const duration = usePlayer(store, (s) => s.duration);
  // Rounded to 0.5 % so the playhead re-renders this bar a few hundred times per video at most.
  const progress = usePlayer(store, (s) =>
    s.duration ? Math.round((s.tSec / s.duration) * 200) / 2 : 0,
  );
  if (!duration) return null;

  // The heat layer shows even while the doubt markers load (or if loading them failed).
  const buckets = (markers?.buckets ?? []).filter((bucket) => bucket.tSec <= duration);
  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const levels = heatLevels(heat, duration);

  return (
    <div className="px-4 sm:px-0">
      <div
        role="group"
        aria-label={`Doubts across the lecture: ${buckets.length} places`}
        className="relative h-8 w-full rounded-md bg-muted"
      >
        {/* Clipped to the rounded bar on its own, so markers at the very ends stay whole. */}
        <div aria-hidden className="absolute inset-0 overflow-hidden rounded-md">
          {levels.map((level) => (
            <div
              key={level.startSec}
              className="absolute inset-y-0 bg-rose-500"
              style={{
                left: `${(level.startSec / duration) * 100}%`,
                width: `max(2px, ${((level.endSec - level.startSec) / duration) * 100}%)`,
                opacity: 0.15 + 0.6 * level.level,
              }}
            />
          ))}
        </div>
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
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>0:00</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span aria-hidden className="inline-block h-2.5 w-1 rounded-sm bg-amber-500" />
            {markers && buckets.length === 0 ? "No doubts yet" : "Doubts"}
          </span>
          <span className="flex items-center gap-1">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-500/60" />
            {levels.length === 0 ? "Nobody lost yet" : "Where people got lost"}
          </span>
        </span>
        <span>{formatClock(duration)}</span>
      </div>
    </div>
  );
}
