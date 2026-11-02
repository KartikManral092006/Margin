"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlayerTimeStore } from "@/features/player/client/time-store";
import {
  adjustBucket,
  bucketStart,
  lostBucket,
  withMine,
  type Heatmap,
} from "@/features/heatmap/shared/heatmap";
import { isLetterShortcut, keyEventInfo } from "@/lib/shortcuts";

// My own change, shown before the server confirms it. `untilVersion` is the heatmap version
// that includes it (unknown while the request is in flight); `at` bounds how long it can stay.
type Pending = { id: number; bucket: number; delta: 1 | -1; at: number; untilVersion?: number };
export type LostNotice = { kind: "marked" | "unmarked" | "failed"; bucket: number };

const NOTICE_MS = 6000;
// A change the server never confirmed by version (e.g. Redis down) stops being shown on top
// after this; by then the stream's periodic read has the truth.
const PENDING_MAX_MS = 15_000;
const JSON_HEADERS = { "content-type": "application/json" };

function applyToMine(mine: number[], pending: Pending[]): number[] {
  const set = new Set(mine);
  for (const change of pending) {
    if (change.delta > 0) set.add(change.bucket);
    else set.delete(change.bucket);
  }
  return [...set].sort((a, b) => a - b);
}

// enabled: false until the player is ready (a mark needs the real playhead, not 0:00).
export function useHeatmap(lectureId: string, store: PlayerTimeStore, enabled: boolean) {
  const [server, setServer] = useState<Heatmap | null>(null);
  const [mine, setMine] = useState<number[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [notice, setNotice] = useState<LostNotice | null>(null);
  const serverRef = useRef<Heatmap | null>(null);
  const mineRef = useRef<number[]>([]);
  const pendingRef = useRef<Pending[]>([]);
  const nextId = useRef(0);
  // Requests go out one at a time, so a quick mark-unmark reaches the server in that order.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const base = `/api/lectures/${lectureId}`;

  const updatePending = useCallback((next: (list: Pending[]) => Pending[]) => {
    pendingRef.current = next(pendingRef.current);
    setPending(pendingRef.current);
  }, []);

  const updateMine = useCallback((next: (list: number[]) => number[]) => {
    mineRef.current = next(mineRef.current);
    setMine(mineRef.current);
  }, []);

  // Stream frames arrive in order and always win (a Redis restart can move the version back).
  // A GET answer loses to anything newer that already arrived.
  const applyServer = useCallback(
    (heatmap: Heatmap, source: "stream" | "get" = "stream"): boolean => {
      const current = serverRef.current;
      if (source === "get" && current && heatmap.version < current.version) return false;
      serverRef.current = heatmap;
      setServer(heatmap);
      updatePending((list) =>
        list.filter((p) => p.untilVersion === undefined || p.untilVersion > heatmap.version),
      );
      return true;
    },
    [updatePending],
  );

  // The server's view, with my changes it doesn't include yet put back on top.
  const load = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(`${base}/heatmap`, { cache: "no-store" });
      if (!response.ok) return false;
      const body = (await response.json()) as Heatmap & { mine: number[] };
      const applied = applyServer({ version: body.version, buckets: body.buckets }, "get");
      updateMine(() => applyToMine(body.mine, pendingRef.current));
      return applied;
    } catch {
      return false;
    }
  }, [base, applyServer, updateMine]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = useCallback(
    (bucket: number, lost: boolean) => {
      const id = ++nextId.current;
      updatePending((list) => [...list, { id, bucket, delta: lost ? 1 : -1, at: Date.now() }]);
      updateMine((list) => applyToMine(list, [{ id, bucket, delta: lost ? 1 : -1, at: 0 }]));
      setNotice({ kind: lost ? "marked" : "unmarked", bucket });
      const drop = () => updatePending((list) => list.filter((p) => p.id !== id));

      queue.current = queue.current.then(async () => {
        try {
          const response = await fetch(`${base}/lost`, {
            method: lost ? "POST" : "DELETE",
            headers: JSON_HEADERS,
            body: JSON.stringify({ tSec: bucketStart(bucket) }),
          });
          if (!response.ok) throw new Error(`lost ${response.status}`);
          const body = (await response.json()) as { changed: boolean; version: number | null };
          if (body.changed && body.version !== null) {
            const version = body.version;
            if ((serverRef.current?.version ?? -1) >= version) drop();
            else
              updatePending((list) =>
                list.map((p) => (p.id === id ? { ...p, untilVersion: version } : p)),
              );
            return;
          }
          // Already that way on the server, or no live version: read the truth. If that read
          // is refused as older, the change stays on top until it expires.
          drop();
          await load();
        } catch {
          // Lost response or error: the change may or may not have been saved. Ask the server.
          drop();
          const read = await load();
          if (!read || mineRef.current.includes(bucket) !== lost) {
            if (!read)
              updateMine((list) =>
                applyToMine(list, [{ id, bucket, delta: lost ? -1 : 1, at: 0 }]),
              );
            setNotice({ kind: "failed", bucket });
          }
        }
      });
    },
    [base, load, updateMine, updatePending],
  );

  // L, or the button: mark (or unmark) the current 15-second bucket.
  const toggle = useCallback(() => {
    if (!enabled) return;
    const bucket = lostBucket(store.getTime());
    send(bucket, !mineRef.current.includes(bucket));
  }, [enabled, store, send]);

  // "Undo" in the notice: the bucket it names, even if the playhead has moved on since.
  const undo = useCallback(
    (bucket: number) => {
      if (mineRef.current.includes(bucket)) send(bucket, false);
    },
    [send],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || !isLetterShortcut(keyEventInfo(event), "l")) return;
      event.preventDefault();
      toggle();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // Changes never confirmed by version stop being shown on top after a while.
  useEffect(() => {
    if (pending.length === 0) return;
    const oldest = Math.min(...pending.map((p) => p.at));
    const timer = setTimeout(
      () => updatePending((list) => list.filter((p) => Date.now() - p.at < PENDING_MAX_MS)),
      Math.max(0, oldest + PENDING_MAX_MS - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [pending, updatePending]);

  const buckets = useMemo(() => {
    const confirmed = server?.buckets ?? [];
    const shown = pending.reduce(
      (list, change) => adjustBucket(list, change.bucket, change.delta),
      confirmed,
    );
    return withMine(shown, mine);
  }, [server, pending, mine]);

  return { loaded: server !== null, enabled, buckets, mine, notice, toggle, undo, applyServer };
}

export type HeatmapState = ReturnType<typeof useHeatmap>;
