"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { PlayerTimeStore } from "@/features/player/client/time-store";
import { nexconnEvents, startNexconn } from "@/features/nexconn/client/engine";
import { MG, decodeContent } from "@/features/nexconn/shared/messages";
import { createFollower } from "@/features/party/shared/follower";
import { partyStateSchema, SYNC_HEARTBEAT_MS, type PartyState } from "@/features/party/shared/sync";
import { clockTrusted, serverNow, syncServerClock } from "@/features/party/client/server-clock";

export type PartyView = {
  id: string;
  channelId: string;
  hostName: string;
  hostNexconnUserId: string;
  isHost: boolean;
  startedAt: string;
};

type PartyResponse = { party: PartyView | null; state: (PartyState & { savedAt: number }) | null };
type Latest = { partyId: string; state: PartyState };

const DISCOVER_MS = 10_000;
// Followers poll the saved state this often while no live message has arrived for 1.5
// heartbeats (no connection, or the host isn't on the channel).
const FOLLOW_POLL_MS = 2000;
const LIVE_FRESH_MS = SYNC_HEARTBEAT_MS * 1.5;
const FOLLOW_STEP_MS = 1000;
const CLOCK_RESYNC_MS = 30_000;
const ENTER_ATTEMPTS = 8;
// After this many failed tries the host asks the server to create the channel again.
const ENTER_RECREATE_AFTER = 3;
// A live state stamped further in the future than this is ignored (a broken or forged clock).
const MAX_FUTURE_MS = 5000;
// A host jump bigger than this (vs. where the last state predicts) is broadcast as a seek.
const HOST_SEEK_SEC = 1.5;
const JSON_HEADERS = { "content-type": "application/json" };

export type PartyRole = "none" | "host" | "viewer";

// Keeps the newest state of the given party; a state from another party always replaces it.
function keepNewest(latest: RefObject<Latest | null>, partyId: string, state: PartyState) {
  const current = latest.current;
  if (current?.partyId === partyId && state.hostSentAt < current.state.hostSentAt) return false;
  latest.current = { partyId, state };
  return true;
}

export function useParty(lectureId: string, store: PlayerTimeStore, live: boolean) {
  const [party, setParty] = useState<PartyView | null>(null);
  const [joinedPartyId, setJoinedPartyId] = useState<string | null>(null);
  const [channelReady, setChannelReady] = useState(false);
  const [drift, setDrift] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef<Latest | null>(null);
  const lastLiveAt = useRef(0);
  const channelReadyRef = useRef(false);
  const base = `/api/lectures/${lectureId}/party`;

  // Joining is for one party: if it ends and another starts, the viewer must join again.
  const joined = party !== null && joinedPartyId === party.id;
  const role: PartyRole = !party ? "none" : party.isHost ? "host" : joined ? "viewer" : "none";

  const refresh = useCallback(async (): Promise<PartyResponse | null> => {
    try {
      const response = await fetch(base, { cache: "no-store" });
      if (!response.ok) return null;
      const body = (await response.json()) as PartyResponse;
      setParty(body.party);
      if (!body.party) latest.current = null;
      // Never let the saved (polled) state replace a newer one received live.
      else if (body.state) keepNewest(latest, body.party.id, body.state);
      return body;
    } catch {
      // Discovery retries on the next interval.
      return null;
    }
  }, [base]);

  // While in a party, keep improving the server-clock estimate (a busy moment can make the
  // first one poor).
  const inParty = party !== null && (party.isHost || joined);
  useEffect(() => {
    if (!inParty) return;
    const interval = setInterval(() => void syncServerClock(), CLOCK_RESYNC_MS);
    return () => clearInterval(interval);
  }, [inParty]);

  // Discover parties started by others (and notice when one ends).
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled && document.visibilityState === "visible") void refresh();
    };
    const first = setTimeout(run, 0);
    const interval = setInterval(run, DISCOVER_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [refresh]);

  useEffect(() => {
    channelReadyRef.current = channelReady;
  }, [channelReady]);

  // Host and joined viewers enter the party's open channel (MG:Sync and party chat).
  const channelId = party?.channelId ?? null;
  const isHost = party?.isHost === true;
  useEffect(() => {
    if (!inParty || !channelId || !live) return;
    let cancelled = false;
    let entered = false;
    (async () => {
      // The server creates the channel just after the party starts, so the first tries can
      // come too early; meanwhile followers poll the saved state.
      for (let attempt = 1; attempt <= ENTER_ATTEMPTS && !cancelled; attempt++) {
        try {
          const { chat } = await startNexconn({ withChatUI: false });
          const result = await new chat.OpenChannel(channelId).enterChannel({ messageCount: 30 });
          if (cancelled) {
            if (result.isOk) void new chat.OpenChannel(channelId).exitChannel();
            return;
          }
          if (result.isOk) {
            entered = true;
            setChannelReady(true);
            return;
          }
        } catch {
          // Retried below.
        }
        if (attempt === ENTER_RECREATE_AFTER && isHost) {
          void fetch(base, { method: "POST", headers: JSON_HEADERS, body: "{}" }).catch(() => {});
        }
        await new Promise((resolve) => setTimeout(resolve, Math.min(10_000, attempt * 2000)));
      }
      if (!cancelled) setError("Party chat isn't available right now. Syncing still works.");
    })();
    return () => {
      cancelled = true;
      setChannelReady(false);
      if (entered) {
        void startNexconn({ withChatUI: false }).then(({ chat }) =>
          new chat.OpenChannel(channelId).exitChannel(),
        );
      }
    };
  }, [inParty, channelId, live, isHost, base]);

  // --- Host: broadcast play, pause, rate changes and seeks, plus a heartbeat every 5 s -------
  const partyId = party?.id ?? null;
  useEffect(() => {
    if (!isHost || !partyId) return;
    let lastSent: PartyState | null = null;

    const broadcast = (action: PartyState["action"]) => {
      const snapshot = store.getSnapshot();
      const state: PartyState = {
        action,
        tSec: store.getTime(),
        playing: snapshot.state === "playing" || snapshot.state === "buffering",
        rate: snapshot.rate,
        hostSentAt: Math.round(serverNow()),
      };
      lastSent = state;
      void fetch(`${base}/state`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ ...state, partyId }),
      }).catch(() => {});
      // Live copies only with a clock good to about a second (the server corrects saved ones).
      if (channelId && channelReadyRef.current && clockTrusted()) {
        void startNexconn({ withChatUI: false })
          .then(({ chat }) =>
            new chat.OpenChannel(channelId).sendMessage(new chat.SendMessageParams(state, MG.Sync)),
          )
          .catch(() => {});
      }
    };

    void syncServerClock().then(() => broadcast("heartbeat"));
    const unsubscribe = store.subscribe(() => {
      if (!lastSent) return;
      const snapshot = store.getSnapshot();
      const playing = snapshot.state === "playing" || snapshot.state === "buffering";
      if (playing !== lastSent.playing) {
        broadcast(playing ? "play" : "pause");
        return;
      }
      if (snapshot.rate !== lastSent.rate) {
        broadcast("rate");
        return;
      }
      const elapsed = lastSent.playing
        ? (lastSent.rate * (serverNow() - lastSent.hostSentAt)) / 1000
        : 0;
      if (Math.abs(snapshot.tSec - (lastSent.tSec + elapsed)) > HOST_SEEK_SEC) broadcast("seek");
    });
    const heartbeat = setInterval(() => broadcast("heartbeat"), SYNC_HEARTBEAT_MS);
    return () => {
      unsubscribe();
      clearInterval(heartbeat);
    };
  }, [isHost, partyId, base, store, channelId]);

  // --- Viewer: follow the host -----------------------------------------------------------------
  const hostNexconnUserId = party?.hostNexconnUserId ?? null;
  const following = role === "viewer";
  useEffect(() => {
    if (!following || !partyId) return;
    const follower = createFollower({
      time: () => store.getTime(),
      playing: () => {
        const state = store.getSnapshot().state;
        return state === "playing" || state === "buffering";
      },
      ended: () => store.getSnapshot().state === "ended",
      duration: () => store.getSnapshot().duration,
      play: () => store.play(),
      pause: () => store.pause(),
      seek: (seconds) => store.seek(seconds),
      setRate: (rate) => store.setRate(rate),
    });
    const step = () => {
      const current = latest.current;
      if (current?.partyId !== partyId) return;
      setDrift(follower.step(current.state, Date.now(), serverNow()).drift);
    };

    // Live: MG:Sync from the host's Nexconn id only (nobody else can send as the host).
    const unsubscribe = nexconnEvents.subscribe((event) => {
      if (event.kind !== "message") return;
      const data = event.data as {
        channelId?: string;
        messageType?: string;
        senderUserId?: string;
        content?: unknown;
      };
      if (data.channelId !== channelId || data.messageType !== MG.Sync) return;
      if (data.senderUserId !== hostNexconnUserId) return;
      const state = decodeContent(partyStateSchema, data.content);
      if (!state || state.hostSentAt > serverNow() + MAX_FUTURE_MS) return;
      lastLiveAt.current = Date.now();
      if (keepNewest(latest, partyId, state)) step();
    });

    void syncServerClock().then(step);
    const stepper = setInterval(step, FOLLOW_STEP_MS);
    // Without fresh live messages, poll the saved state instead.
    const poller = setInterval(() => {
      if (Date.now() - lastLiveAt.current > LIVE_FRESH_MS) void refresh();
    }, FOLLOW_POLL_MS);
    return () => {
      unsubscribe();
      clearInterval(stepper);
      clearInterval(poller);
      lastLiveAt.current = 0;
      follower.stop();
      setDrift(null);
    };
  }, [following, partyId, store, channelId, hostNexconnUserId, refresh]);

  const start = useCallback(async () => {
    setError(null);
    await syncServerClock();
    const response = await fetch(base, { method: "POST", headers: JSON_HEADERS, body: "{}" });
    if (!response.ok) {
      setError("Couldn't start a watch party. Try again.");
      return;
    }
    await refresh();
  }, [base, refresh]);

  const end = useCallback(async () => {
    const response = await fetch(base, { method: "DELETE", headers: JSON_HEADERS, body: "{}" });
    if (!response.ok) setError("Couldn't end the party. Try again.");
    await refresh();
  }, [base, refresh]);

  const join = useCallback(async () => {
    setError(null);
    await syncServerClock();
    const body = await refresh();
    if (body?.party) setJoinedPartyId(body.party.id);
  }, [refresh]);

  const leave = useCallback(() => setJoinedPartyId(null), []);

  return { party, role, joined, channelReady, drift, error, start, end, join, leave };
}
