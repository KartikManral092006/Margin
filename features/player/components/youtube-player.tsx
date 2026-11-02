"use client";

import { useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { PlayerTimeStore } from "@/features/player/client/time-store";
import { usePlayer } from "@/features/player/client/use-player";
import { useYouTubePlayer } from "@/features/player/client/use-youtube-player";

// Full-bleed 16:9 box, at least 200 px tall (YouTube's minimum embed size). Nothing is drawn
// over the player once it is ready.
export function YouTubePlayer(props: {
  videoId: string;
  startSec: number | null;
  store: PlayerTimeStore;
  onError: (code: number) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  useYouTubePlayer(wrapperRef, props);
  const ready = usePlayer(props.store, (snapshot) => snapshot.ready);

  return (
    <div className="relative aspect-video min-h-[200px] w-full overflow-hidden bg-black">
      <div ref={wrapperRef} className="absolute inset-0 [&_iframe]:size-full" />
      {!ready && (
        <Skeleton aria-label="Loading video" className="absolute inset-0 rounded-none bg-muted" />
      )}
    </div>
  );
}
