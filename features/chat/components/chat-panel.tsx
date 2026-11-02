"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRoomChat } from "@/features/chat/client/use-room-chat";
import { CHAT_MAX_CHARS } from "@/features/chat/shared/chat";

function timeOf(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatPanel({
  lectureId,
  channelId,
  kind = "group",
  canSend = true,
  label = "Room chat",
  placeholder = "Message the room",
}: {
  lectureId: string;
  channelId: string | null;
  kind?: "group" | "open";
  canSend?: boolean;
  label?: string;
  placeholder?: string;
}) {
  const { lines, names, ready, error, send } = useRoomChat(lectureId, channelId, kind);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const length = Array.from(draft.trim()).length;

  // Keep the newest message in view.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [lines.length]);

  if (!channelId) {
    return (
      <p className="text-sm text-muted-foreground">
        Room chat connects when the room is live. Doubts still work meanwhile.
      </p>
    );
  }
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  function submit() {
    if (length === 0 || length > CHAT_MAX_CHARS) return;
    void send(draft);
    setDraft("");
  }

  return (
    <section className="flex flex-col gap-3" aria-label={label}>
      {!ready ? (
        <div className="space-y-2" aria-label="Loading chat">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="ml-auto h-8 w-1/2" />
        </div>
      ) : lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No messages yet. Say hi, or ask what everyone is working on.
        </p>
      ) : (
        <ol
          ref={listRef}
          className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1"
          aria-live="polite"
        >
          {lines.map((line) => (
            <li
              key={line.id}
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                line.mine ? "self-end bg-primary text-primary-foreground" : "self-start bg-muted"
              }`}
            >
              {!line.mine && (
                <p className="text-xs font-medium opacity-80">
                  {names[line.senderId] ?? "Someone"}
                </p>
              )}
              <p className="break-words whitespace-pre-wrap">{line.text}</p>
              <p className="text-right text-[10px] opacity-70">
                {line.local === "sending"
                  ? "sending…"
                  : line.local === "failed"
                    ? "not sent"
                    : timeOf(line.sentTime)}
              </p>
            </li>
          ))}
        </ol>
      )}

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label htmlFor={`chat-input-${kind}`} className="sr-only">
          {placeholder}
        </label>
        <input
          id={`chat-input-${kind}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={CHAT_MAX_CHARS * 2}
          placeholder={canSend ? placeholder : "Connecting…"}
          disabled={!canSend}
          autoComplete="off"
          className="h-11 min-w-0 flex-1 rounded-md border bg-background px-3 text-base sm:text-sm"
        />
        <Button
          type="submit"
          className="h-11"
          disabled={!canSend || length === 0 || length > CHAT_MAX_CHARS}
        >
          Send
        </Button>
      </form>
    </section>
  );
}
