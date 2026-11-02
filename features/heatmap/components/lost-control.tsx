"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import type { HeatmapState } from "@/features/heatmap/client/use-heatmap";
import { bucketStart, hottestStretch, lostBucket } from "@/features/heatmap/shared/heatmap";
import type { PlayerTimeStore } from "@/features/player/client/time-store";
import { usePlayer } from "@/features/player/client/use-player";
import { formatClock } from "@/features/player/shared/format";

// "I'm lost" for the current 15 seconds (also the L key), and where most people got lost.
export function LostControl({ heat, store }: { heat: HeatmapState; store: PlayerTimeStore }) {
  const bucket = usePlayer(store, (s) => lostBucket(s.tSec));
  const marked = heat.mine.includes(bucket);
  const stretch = useMemo(() => hottestStretch(heat.buckets), [heat.buckets]);
  const notice = heat.notice;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 text-sm sm:px-0">
      <Button
        variant={marked ? "secondary" : "outline"}
        size="sm"
        className="h-9"
        aria-pressed={marked}
        disabled={!heat.enabled}
        onClick={heat.toggle}
      >
        {marked ? "Marked: lost here" : "I'm lost here"}
        <kbd className="ml-1 hidden rounded border px-1 text-[11px] text-muted-foreground sm:inline">
          L
        </kbd>
      </Button>
      <span aria-live="polite" className="flex items-center gap-2 text-muted-foreground">
        {notice?.kind === "marked" && (
          <>
            Marked at {formatClock(bucketStart(notice.bucket))} (anonymous).
            <button
              type="button"
              className="font-medium text-foreground underline underline-offset-4"
              onClick={() => heat.undo(notice.bucket)}
            >
              Undo
            </button>
          </>
        )}
        {notice?.kind === "unmarked" &&
          `Removed your mark at ${formatClock(bucketStart(notice.bucket))}.`}
        {notice?.kind === "failed" && (
          <span className="text-destructive">Couldn&apos;t save that. Try again.</span>
        )}
      </span>
      {stretch && (
        <button
          type="button"
          className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          onClick={() => store.seek(stretch.startSec)}
        >
          Most lost: {formatClock(stretch.startSec)}–{formatClock(stretch.endSec)} · {stretch.peak}{" "}
          {stretch.peak === 1 ? "person" : "people"}
        </button>
      )}
    </div>
  );
}
