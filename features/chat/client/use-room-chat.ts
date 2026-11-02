"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nexconnEvents, startNexconn } from "@/features/nexconn/client/engine";
import {
  chatLineFromMessage,
  mergeChat,
  normalizeChatText,
  type ChatLine,
} from "@/features/chat/shared/chat";

const HISTORY_SIZE = 30;
const NAMES_DEBOUNCE_MS = 200;

// Chat over a Nexconn channel: the lecture's group (room chat; the last 30 messages come from
// Nexconn's history) or a watch party's open channel (no history: the last messages arrive
// when the party hook enters the channel, so this subscribes first).
export function useRoomChat(
  lectureId: string,
  channelId: string | null,
  kind: "group" | "open" = "group",
) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selfIdRef = useRef<string | null>(null);
  const knownNames = useRef(new Set<string>());
  const wantedNames = useRef(new Set<string>());
  const namesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestNames = useCallback(
    (ids: string[]) => {
      for (const id of ids) if (!knownNames.current.has(id)) wantedNames.current.add(id);
      if (wantedNames.current.size === 0 || namesTimer.current) return;
      namesTimer.current = setTimeout(() => {
        namesTimer.current = null;
        const batch = [...wantedNames.current].slice(0, 50);
        batch.forEach((id) => {
          wantedNames.current.delete(id);
          knownNames.current.add(id);
        });
        fetch(`/api/lectures/${lectureId}/people?ids=${batch.join(",")}`, { cache: "no-store" })
          .then((response) => (response.ok ? response.json() : null))
          .then((body: { names?: Record<string, string> } | null) => {
            if (body?.names) setNames((current) => ({ ...current, ...body.names }));
          })
          .catch(() => {});
      }, NAMES_DEBOUNCE_MS);
    },
    [lectureId],
  );

  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;

    const unsubscribe = nexconnEvents.subscribe((event) => {
      if (event.kind !== "message") return;
      const data = event.data as { channelId?: string };
      if (data.channelId !== channelId) return;
      const line = chatLineFromMessage(
        event.data as Parameters<typeof chatLineFromMessage>[0],
        selfIdRef.current,
      );
      if (!line) return;
      setLines((current) => mergeChat(current, [line]));
      requestNames([line.senderId]);
    });

    (async () => {
      try {
        const session = await startNexconn({ withChatUI: false });
        selfIdRef.current = session.userId;
        if (kind === "open") {
          if (!cancelled) setReady(true);
          return;
        }
        const { chat } = session;
        const query = chat.BaseChannel.createMessagesQuery({
          channelIdentifier: new chat.GroupChannelIdentifier(channelId),
          pageSize: HISTORY_SIZE,
        });
        const result = await query.loadNextPage();
        if (cancelled) return;
        if (result.isOk && result.data) {
          const history = result.data.data
            .map((message) => chatLineFromMessage(message, session.userId))
            .filter((line): line is ChatLine => line !== null);
          setLines((current) => mergeChat(current, history));
          requestNames(history.map((line) => line.senderId));
        }
        setReady(true);
      } catch {
        if (!cancelled) setError("Room chat isn't available right now.");
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [channelId, kind, requestNames]);

  const send = useCallback(
    async (raw: string) => {
      const text = normalizeChatText(raw);
      if (!text || !channelId) return;
      const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const selfId = selfIdRef.current ?? "me";
      const optimistic: ChatLine = {
        id: tempId,
        senderId: selfId,
        text,
        sentTime: Date.now(),
        mine: true,
        local: "sending",
      };
      setLines((current) => mergeChat(current, [optimistic]));
      try {
        const { chat } = await startNexconn({ withChatUI: false });
        const channel =
          kind === "open" ? new chat.OpenChannel(channelId) : new chat.GroupChannel(channelId);
        const result = await channel.sendMessage(new chat.SendTextMessageParams({ text }));
        if (!result.isOk || !result.data) throw new Error(`send failed: ${result.code}`);
        const sent = result.data;
        setLines((current) =>
          mergeChat(
            current.filter((line) => line.id !== tempId),
            [{ ...optimistic, id: sent.messageId, sentTime: sent.sentTime, local: null }],
          ),
        );
      } catch {
        setLines((current) =>
          current.map((line) => (line.id === tempId ? { ...line, local: "failed" } : line)),
        );
      }
    },
    [channelId, kind],
  );

  return { lines, names, ready, error, send };
}
