"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { PlayerTimeStore } from "@/features/player/client/time-store";
import { usePlayer } from "@/features/player/client/use-player";
import { nexconnEvents, startNexconn } from "@/features/nexconn/client/engine";
import { momentFromSignal, type IncomingMessage } from "@/features/moments/shared/signal";
import type { MomentView } from "@/features/moments/shared/schemas";
import {
  EMPTY_MOMENTS,
  momentsReducer,
  newClientId,
  WINDOW_STEP_SEC,
  windowFor,
} from "@/features/moments/shared/store";

const POLL_MS = 5000;
const LIVE_REFRESH_MS = 30_000;

export type LiveStatus = "connecting" | "live" | "polling";

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status}`);
  return (await response.json()) as T;
}

type WindowResult = {
  from: number;
  to: number;
  moments: MomentView[] | null;
  requestedAt: number;
};

// No React state here, so effects can start it without setting state synchronously.
async function fetchWindow(
  base: string,
  window: { from: number; to: number },
): Promise<WindowResult> {
  const requestedAt = Date.now();
  try {
    const body = await getJson<{ moments: MomentView[] }>(
      `${base}?from=${window.from}&to=${window.to}`,
    );
    return { ...window, moments: body.moments, requestedAt };
  } catch {
    return { ...window, moments: null, requestedAt };
  }
}

export function useRoomMoments(lectureId: string, store: PlayerTimeStore) {
  const [state, dispatch] = useReducer(momentsReducer, EMPTY_MOMENTS);
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [loadError, setLoadError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const step = usePlayer(store, (s) => Math.floor(s.tSec / WINDOW_STEP_SEC));
  const windowRef = useRef(windowFor(0));
  const base = `/api/lectures/${lectureId}/moments`;

  const applyWindow = useCallback((result: WindowResult) => {
    // A response for a window the playhead has already left is ignored.
    const current = windowRef.current;
    if (result.from !== current.from || result.to !== current.to) return;
    if (result.moments) {
      dispatch({
        type: "replaceWindow",
        from: result.from,
        to: result.to,
        moments: result.moments,
        requestedAt: result.requestedAt,
        at: Date.now(),
      });
    }
    setLoadError(result.moments === null);
    setLoaded(true);
  }, []);

  // For event handlers and timers (reconnect, polling, retry button).
  const loadWindow = useCallback(
    () => fetchWindow(base, windowRef.current).then(applyWindow),
    [base, applyWindow],
  );

  // Reload whenever the playhead moves into another 5-minute step (e.g. after a seek).
  useEffect(() => {
    const target = windowFor(step * WINDOW_STEP_SEC);
    windowRef.current = target;
    let cancelled = false;
    fetchWindow(base, target).then((result) => {
      if (!cancelled) applyWindow(result);
    });
    return () => {
      cancelled = true;
    };
  }, [step, base, applyWindow]);

  // Live signal: join the room's Nexconn group and connect. Each MG:Moment from marginbot
  // carries the whole doubt, so it is shown at once (momentFromSignal drops anything else).
  useEffect(() => {
    let cancelled = false;
    let channelId: string | null = null;

    const unsubscribe = nexconnEvents.subscribe((event) => {
      if (event.kind === "connection") {
        const connected = (event.data as { status?: number }).status === 0;
        setStatus(connected ? "live" : "polling");
        // Catch up on anything missed while disconnected.
        if (connected) void loadWindow();
        return;
      }
      if (event.kind !== "message" || channelId === null) return;
      const moment = momentFromSignal(event.data as IncomingMessage, { lectureId, channelId });
      if (moment) dispatch({ type: "merge", moments: [moment], at: Date.now() });
    });

    (async () => {
      try {
        const response = await fetch(`/api/lectures/${lectureId}/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
        const body = (await response.json().catch(() => null)) as {
          chat?: string;
          channelId?: string;
        } | null;
        if (!response.ok || body?.chat !== "ok" || !body.channelId) throw new Error("no chat");
        channelId = body.channelId;
        await startNexconn({ withChatUI: false });
        if (!cancelled) setStatus("live");
      } catch {
        if (!cancelled) setStatus("polling");
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [lectureId, loadWindow]);

  // Without the live signal, refresh the window every few seconds. While live, a slow refresh
  // still runs, so a doubt whose signal failed (and wasn't resent yet) shows up eventually.
  useEffect(() => {
    const interval = setInterval(
      () => {
        if (document.visibilityState === "visible") void loadWindow();
      },
      status === "live" ? LIVE_REFRESH_MS : POLL_MS,
    );
    return () => clearInterval(interval);
  }, [status, loadWindow]);

  const post = useCallback(
    async (clientId: string, body: string, tSec: number) => {
      try {
        const response = await fetch(base, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clientId, body, tSec }),
        });
        const json = (await response.json().catch(() => null)) as {
          moment?: MomentView;
          error?: string;
        } | null;
        if (response.ok && json?.moment) {
          dispatch({ type: "confirmed", clientId, moment: json.moment, at: Date.now() });
          return;
        }
        // 429 and 5xx can succeed later; other 4xx won't, so the doubt is rolled back.
        const retryable = response.status === 429 || response.status >= 500;
        dispatch({ type: "failed", clientId, error: json?.error ?? "error", retryable });
      } catch {
        dispatch({ type: "failed", clientId, error: "network", retryable: true });
      }
    },
    [base],
  );

  const submit = useCallback(
    (body: string, tSec: number) => {
      const clientId = newClientId();
      dispatch({
        type: "optimistic",
        moment: {
          id: clientId,
          lectureId,
          tSec: Math.floor(tSec),
          body,
          parentId: null,
          status: "open",
          upvotes: 0,
          pinned: false,
          authorName: "You",
          mine: true,
          clientId,
          createdAt: new Date().toISOString(),
        },
        at: Date.now(),
      });
      void post(clientId, body, tSec);
    },
    [lectureId, post],
  );

  const retry = useCallback(
    (clientId: string) => {
      const item = state.items.find((candidate) => candidate.key === clientId);
      if (!item) return;
      dispatch({ type: "retrying", clientId });
      void post(clientId, item.body, item.tSec);
    },
    [state.items, post],
  );

  return { items: state.items, status, loaded, loadError, submit, retry, reload: loadWindow };
}
