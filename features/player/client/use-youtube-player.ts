"use client";

import { useEffect, useEffectEvent, type RefObject } from "react";
import type { PlayerTimeStore } from "@/features/player/client/time-store";
import { loadYouTubeIframeApi } from "@/features/player/client/youtube-api";
import { PLAYER_ERROR, type YTPlayer } from "@/features/player/client/yt-types";

// Privacy-enhanced embed host. If playback fails with error 2 or 153, switch to
// "https://www.youtube.com"; nothing else depends on it.
export const PLAYER_HOST = "https://www.youtube-nocookie.com";

export function useYouTubePlayer(
  wrapperRef: RefObject<HTMLDivElement | null>,
  options: {
    videoId: string;
    startSec: number | null;
    store: PlayerTimeStore;
    onError: (code: number) => void;
  },
) {
  const { videoId, startSec, store } = options;
  const reportError = useEffectEvent((code: number) => options.onError(code));

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    let cancelled = false;
    let player: YTPlayer | null = null;

    // YT.Player replaces the element it is given, so React must never own that node.
    const target = document.createElement("div");
    wrapper.replaceChildren(target);

    loadYouTubeIframeApi().then(
      (YT) => {
        if (cancelled) return;
        player = new YT.Player(target, {
          host: PLAYER_HOST,
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
            ...(startSec ? { start: startSec } : {}),
          },
          events: {
            // Player methods exist only after onReady.
            onReady: (event) => store.attach(event.target),
            onStateChange: (event) => store.onState(event.data),
            onPlaybackRateChange: (event) => store.onRate(event.data),
            onError: (event) => reportError(event.data),
          },
        });
      },
      () => {
        if (!cancelled) reportError(PLAYER_ERROR.LOADER_FAILED);
      },
    );

    return () => {
      cancelled = true;
      store.detach();
      player?.destroy();
      wrapper.replaceChildren();
    };
  }, [wrapperRef, videoId, startSec, store]);
}
