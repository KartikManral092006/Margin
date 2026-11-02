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
const REFRESH_DEBOUNCE_MS = 150;
const MARKERS_DEBOUNCE_MS = 1500;
const JSON_HEADERS = { "content-type": "application/json" };
const CHAT_ATTEMPTS = 4;

type ChatReply = { chat?: string; channelId?: string };

export type Markers = { bucketSec: number; buckets: { tSec: number; count: number }[] };

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

async function fetchMarkers(lectureId: string): Promise<Markers | null> {
  try {
    return await getJson<Markers>(`/api/lectures/${lectureId}/moments/markers`);
  } catch {
    return null;
  }
}

async function sendJson(url: string, method: string, body: unknown = {}) {
  const response = await fetch(url, { method, headers: JSON_HEADERS, body: JSON.stringify(body) });
  const json = (await response.json().catch(() => null)) as {
    moment?: MomentView;
    error?: string;
  } | null;
  return { response, json };
}

export function useRoomMoments(lectureId: string, store: PlayerTimeStore) {
  const [state, dispatch] = useReducer(momentsReducer, EMPTY_MOMENTS);
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [loadError, setLoadError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [markers, setMarkers] = useState<Markers | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The live handler runs outside React's render, so it reads the latest items from a ref.
  const itemsRef = useRef(state.items);
  useEffect(() => {
    itemsRef.current = state.items;
  }, [state.items]);
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
  // A metadata update (votes, status) only says "this moment changed": we re-read it from
  // our API, because metadata doesn't prove who set it.
  useEffect(() => {
    let cancelled = false;
    let channelId: string | null = null;
    const stale = new Set<string>();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const refreshStale = () => {
      refreshTimer = null;
      const ids = [...stale].slice(0, 20);
      ids.forEach((id) => stale.delete(id));
      if (ids.length > 0) {
        getJson<{ moments: MomentView[] }>(`${base}?ids=${ids.join(",")}`)
          .then((body) => {
            if (!cancelled) dispatch({ type: "merge", moments: body.moments, at: Date.now() });
          })
          .catch(() => {});
      }
      if (stale.size > 0) refreshTimer = setTimeout(refreshStale, REFRESH_DEBOUNCE_MS);
    };

    const unsubscribe = nexconnEvents.subscribe((event) => {
      if (event.kind === "connection") {
        const connected = (event.data as { status?: number }).status === 0;
        setStatus(connected ? "live" : "polling");
        // Catch up on anything missed while disconnected.
        if (connected) void loadWindow();
        return;
      }
      if (channelId === null) return;
      if (event.kind === "metadataUpdated") {
        const data = event.data as { messageId?: string; channelId?: string };
        if (data.channelId !== channelId || !data.messageId) return;
        const item = itemsRef.current.find((i) => i.nexconnMessageId === data.messageId);
        if (!item) return;
        stale.add(item.id);
        refreshTimer ??= setTimeout(refreshStale, REFRESH_DEBOUNCE_MS);
        return;
      }
      if (event.kind !== "message") return;
      const moment = momentFromSignal(event.data as IncomingMessage, { lectureId, channelId });
      if (moment) dispatch({ type: "incoming", moment, at: Date.now() });
    });

    (async () => {
      try {
        // A 503 is often temporary (Nexconn slow, or another student creating this room's
        // group right now): retry a few times with backoff before settling for polling.
        let body = null as ChatReply | null;
        for (let attempt = 0; attempt < CHAT_ATTEMPTS && !cancelled; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
          const response = await fetch(`/api/lectures/${lectureId}/chat`, {
            method: "POST",
            headers: JSON_HEADERS,
            body: "{}",
          });
          body = (await response.json().catch(() => null)) as ChatReply | null;
          if (response.ok || response.status !== 503) break;
        }
        if (body?.chat !== "ok" || !body.channelId) throw new Error("no chat");
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
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [lectureId, base, loadWindow]);

  // Markers for the whole lecture: on load, then shortly after the number of doubts changes.
  const topLevelCount = state.items.filter((i) => i.parentId === null && i.local === null).length;
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(
      () => {
        fetchMarkers(lectureId).then((result) => {
          if (!cancelled && result) setMarkers(result);
        });
      },
      topLevelCount === 0 ? 0 : MARKERS_DEBOUNCE_MS,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [lectureId, topLevelCount]);

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
    async (clientId: string, body: string, tSec: number, parentId: string | null) => {
      try {
        const { response, json } = await sendJson(base, "POST", {
          clientId,
          body,
          tSec,
          parentId,
        });
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
    (body: string, tSec: number, parentId: string | null = null) => {
      const clientId = newClientId();
      dispatch({
        type: "optimistic",
        moment: {
          id: clientId,
          lectureId,
          tSec: Math.floor(tSec),
          body,
          parentId,
          status: "open",
          upvotes: 0,
          pinned: false,
          authorName: "You",
          mine: true,
          clientId,
          votedByMe: false,
          nexconnMessageId: null,
          createdAt: new Date().toISOString(),
        },
        at: Date.now(),
      });
      void post(clientId, body, tSec, parentId);
    },
    [lectureId, post],
  );

  const retry = useCallback(
    (clientId: string) => {
      const item = state.items.find((candidate) => candidate.key === clientId);
      if (!item) return;
      dispatch({ type: "retrying", clientId });
      void post(clientId, item.body, item.tSec, item.parentId);
    },
    [state.items, post],
  );

  // Optimistic; the API's answer settles the real count, a refusal reverts it.
  const vote = useCallback(async (id: string, on: boolean) => {
    dispatch({ type: "vote", id, on });
    try {
      const { response, json } = await sendJson(`/api/moments/${id}/vote`, on ? "POST" : "DELETE");
      if (response.ok && json?.moment) {
        dispatch({ type: "merge", moments: [json.moment], at: Date.now() });
        return;
      }
      throw new Error(json?.error ?? "vote failed");
    } catch {
      dispatch({ type: "vote", id, on: !on });
      setNotice("Couldn't save your vote. Try again.");
    }
  }, []);

  const resolve = useCallback(async (id: string, resolved: boolean) => {
    dispatch({ type: "status", id, status: resolved ? "resolved" : "open" });
    try {
      const { response, json } = await sendJson(`/api/moments/${id}/resolve`, "POST", { resolved });
      if (response.ok && json?.moment) {
        dispatch({ type: "merge", moments: [json.moment], at: Date.now() });
        return;
      }
      throw new Error(json?.error ?? "resolve failed");
    } catch {
      dispatch({ type: "status", id, status: resolved ? "open" : "resolved" });
      setNotice("Couldn't update the doubt. Try again.");
    }
  }, []);

  return {
    items: state.items,
    status,
    loaded,
    loadError,
    markers,
    notice,
    clearNotice: () => setNotice(null),
    submit,
    retry,
    vote,
    resolve,
    reload: loadWindow,
  };
}
