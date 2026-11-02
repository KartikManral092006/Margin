"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PlayerTimeStore } from "@/features/player/client/time-store";
import { usePlayer } from "@/features/player/client/use-player";
import { formatClock } from "@/features/player/shared/format";
import { useRoomMoments, type LiveStatus } from "@/features/moments/client/use-room-moments";
import { MAX_BODY_CHARS } from "@/features/moments/shared/schemas";
import { isComposerShortcut, type MomentItem } from "@/features/moments/shared/store";

// A doubt counts as "now" while the playhead is within this many seconds of it.
const NOW_RANGE_SEC = 10;

const STATUS_TEXT: Record<LiveStatus, string> = {
  connecting: "Connecting…",
  live: "Live",
  polling: "Updating every few seconds",
};

function Composer({
  tSec,
  onSubmit,
  onClose,
}: {
  tSec: number;
  onSubmit: (body: string) => void;
  onClose: () => void;
}) {
  const [body, setBody] = useState("");
  const length = Array.from(body.trim()).length;
  const tooLong = length > MAX_BODY_CHARS;

  function submit() {
    if (length === 0 || tooLong) return;
    onSubmit(body);
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor="moment-body" className="text-sm font-medium">
        Your doubt at <span className="font-mono">{formatClock(tSec)}</span>
      </label>
      <textarea
        id="moment-body"
        autoFocus
        rows={3}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder="What lost you here?"
        className="w-full resize-y rounded-md border bg-background p-2 text-base sm:text-sm"
        aria-describedby="moment-help"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          id="moment-help"
          className={`text-xs ${tooLong ? "text-destructive" : "text-muted-foreground"}`}
        >
          {length}/{MAX_BODY_CHARS} · Enter to post, Shift+Enter for a new line
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="h-10" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="h-10" disabled={length === 0 || tooLong}>
            Post doubt
          </Button>
        </div>
      </div>
    </form>
  );
}

function MomentRow({
  item,
  isNow,
  onSeek,
  onRetry,
}: {
  item: MomentItem;
  isNow: boolean;
  onSeek: (tSec: number) => void;
  onRetry: (clientId: string) => void;
}) {
  return (
    <li
      className={`flex gap-3 rounded-lg p-2 ${isNow ? "bg-amber-50 dark:bg-amber-950/40" : ""}`}
      aria-current={isNow ? "time" : undefined}
    >
      <button
        type="button"
        onClick={() => onSeek(item.tSec)}
        className="h-fit shrink-0 rounded-md bg-muted px-2 py-1 font-mono text-xs tabular-nums hover:bg-muted/70"
        aria-label={`Jump to ${formatClock(item.tSec)}`}
      >
        {formatClock(item.tSec)}
      </button>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs text-muted-foreground">
          {item.mine ? "You" : item.authorName}
          {item.local === "sending" && " · sending…"}
        </p>
        <p className="text-sm break-words whitespace-pre-wrap">{item.body}</p>
        {item.local === "failed" && (
          <p className="text-xs text-destructive">
            Not sent.{" "}
            <button
              type="button"
              className="font-medium underline underline-offset-4"
              onClick={() => onRetry(item.key)}
            >
              Retry
            </button>
          </p>
        )}
      </div>
    </li>
  );
}

export function MomentsPanel({ lectureId, store }: { lectureId: string; store: PlayerTimeStore }) {
  const { items, status, loaded, loadError, submit, retry, reload } = useRoomMoments(
    lectureId,
    store,
  );
  const now = usePlayer(store, (s) => Math.floor(s.tSec));
  const [composerAt, setComposerAt] = useState<number | null>(null);
  const askButtonRef = useRef<HTMLButtonElement>(null);

  // The time is captured when the composer opens, not when the doubt is posted.
  function openComposer() {
    setComposerAt(Math.floor(store.getTime()));
  }

  function closeComposer() {
    setComposerAt(null);
    // The Ask button mounts again on the next render; focus it then.
    setTimeout(() => askButtonRef.current?.focus(), 0);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        isComposerShortcut({
          key: event.key,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
          isComposing: event.isComposing,
          targetTag: target?.tagName ?? null,
          targetEditable: target?.isContentEditable ?? false,
        })
      ) {
        event.preventDefault();
        // An open composer keeps the second it was opened at.
        setComposerAt((current) => current ?? Math.floor(store.getTime()));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);

  const topLevel = items.filter((item) => item.parentId === null);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="moments-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="moments-heading" className="text-base font-semibold">
          Doubts
        </h2>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {STATUS_TEXT[status]}
        </span>
      </div>

      {composerAt === null ? (
        <Button ref={askButtonRef} className="h-11 w-full sm:w-auto" onClick={openComposer}>
          Ask at {formatClock(now)}
          <kbd className="ml-2 hidden rounded border px-1 text-xs sm:inline">D</kbd>
        </Button>
      ) : (
        <Composer
          tSec={composerAt}
          onClose={closeComposer}
          onSubmit={(body) => {
            submit(body, composerAt);
            closeComposer();
          }}
        />
      )}

      {!loaded ? (
        <div className="space-y-2" aria-label="Loading doubts">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : loadError && topLevel.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load doubts.{" "}
          <button
            type="button"
            className="font-medium text-foreground underline underline-offset-4"
            onClick={() => void reload()}
          >
            Try again
          </button>
        </p>
      ) : topLevel.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No doubts around {formatClock(now)} yet. Lost somewhere? Press D or tap Ask.
        </p>
      ) : (
        <ul className="flex flex-col gap-1" aria-live="polite">
          {topLevel.map((item) => (
            <MomentRow
              key={item.key}
              item={item}
              isNow={Math.abs(item.tSec - now) <= NOW_RANGE_SEC}
              onSeek={(tSec) => store.seek(tSec)}
              onRetry={retry}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
