"use client";

import { useEffect, useEffectEvent, useState } from "react";
import type { Heatmap } from "@/features/heatmap/shared/heatmap";
import type { PlayerTimeStore } from "@/features/player/client/time-store";
import { usePlayer } from "@/features/player/client/use-player";
import {
  HEARTBEAT_MS,
  presenceWindow,
  type PresenceSnapshot,
} from "@/features/presence/shared/presence";

function sendHeartbeat(lectureId: string, store: PlayerTimeStore) {
  const snapshot = store.getSnapshot();
  void fetch(`/api/lectures/${lectureId}/presence`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tSec: store.getTime(), playing: snapshot.state === "playing" }),
    keepalive: true,
  }).catch(() => {});
}

// Reports where this viewer is in the video and listens to who else is where. The same stream
// carries heatmap changes ("I'm lost" counts), handed to onHeatmap.
export function usePresence(
  lectureId: string,
  store: PlayerTimeStore,
  onHeatmap?: (heatmap: Heatmap) => void,
) {
  const [snapshot, setSnapshot] = useState<PresenceSnapshot | null>(null);
  const handleHeatmap = useEffectEvent((heatmap: Heatmap) => onHeatmap?.(heatmap));
  const slot = usePlayer(store, (s) => presenceWindow(s.tSec));

  // Heartbeat on mount, whenever my 30-second window changes, and every 10 s.
  useEffect(() => {
    sendHeartbeat(lectureId, store);
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") sendHeartbeat(lectureId, store);
    }, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [lectureId, store, slot]);

  // Leaving the page removes me at once instead of after the 45 s expiry.
  useEffect(() => {
    const leave = () => {
      const blob = new Blob(["{}"], { type: "application/json" });
      navigator.sendBeacon(`/api/lectures/${lectureId}/presence/leave`, blob);
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [lectureId]);

  useEffect(() => {
    const source = new EventSource(`/api/lectures/${lectureId}/presence`);
    source.addEventListener("presence", (event) => {
      try {
        setSnapshot(JSON.parse((event as MessageEvent<string>).data) as PresenceSnapshot);
      } catch {
        // Ignore a malformed frame; the next one replaces it.
      }
    });
    source.addEventListener("heatmap", (event) => {
      try {
        handleHeatmap(JSON.parse((event as MessageEvent<string>).data) as Heatmap);
      } catch {
        // Ignore a malformed frame; the next change sends a new one.
      }
    });
    return () => source.close();
  }, [lectureId]);

  return snapshot;
}
