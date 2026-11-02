"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PlayerTimeStore } from "@/features/player/client/time-store";
import { usePlayer } from "@/features/player/client/use-player";
import { formatClock } from "@/features/player/shared/format";
import type { LiveStatus, useRoomMoments } from "@/features/moments/client/use-room-moments";
import { MAX_BODY_CHARS } from "@/features/moments/shared/schemas";
import { isComposerShortcut, type MomentItem } from "@/features/moments/shared/store";

export type RoomMoments = ReturnType<typeof useRoomMoments>;

// A doubt counts as "now" while the playhead is within this many seconds of it.
const NOW_RANGE_SEC = 10;

const STATUS_TEXT: Record<LiveStatus, string> = {
  connecting: "Connecting…",
  live: "Live",
  polling: "Updating every few seconds",
};

function TextComposer({
  id,
  label,
  placeholder,
  submitLabel,
  onSubmit,
  onClose,
}: {
  id: string;
  label: React.ReactNode;
  placeholder: string;
  submitLabel: string;
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
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
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
        placeholder={placeholder}
        className="w-full resize-y rounded-md border bg-background p-2 text-base sm:text-sm"
        aria-describedby={`${id}-help`}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          id={`${id}-help`}
          className={`text-xs ${tooLong ? "text-destructive" : "text-muted-foreground"}`}
        >
          {length}/{MAX_BODY_CHARS} · Enter to post, Shift+Enter for a new line
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="h-10" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="h-10" disabled={length === 0 || tooLong}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}

function FailedNote({ item, onRetry }: { item: MomentItem; onRetry: (key: string) => void }) {
  if (item.local !== "failed") return null;
  return (
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
  );
}

function VoteButton({
  item,
  onVote,
}: {
  item: MomentItem;
  onVote: (id: string, on: boolean) => void;
}) {
  // Not on my own doubt, and not before the server has it.
  const disabled = item.mine || item.local !== null;
  return (
    <button
      type="button"
      aria-pressed={item.votedByMe}
      disabled={disabled}
      onClick={() => onVote(item.id, !item.votedByMe)}
      title={
        item.mine ? "Your doubt" : item.votedByMe ? "Remove your vote" : "I have this doubt too"
      }
      aria-label={`${item.upvotes} ${item.upvotes === 1 ? "person has" : "people have"} this doubt${
        item.votedByMe ? ", including you" : ""
      }`}
      className={`inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs tabular-nums ${
        item.votedByMe ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40" : ""
      } disabled:opacity-60`}
    >
      <span aria-hidden>▲</span>
      {item.upvotes}
      <span className="hidden sm:inline">{item.votedByMe ? "You too" : "Me too"}</span>
    </button>
  );
}

function MomentRow({
  item,
  replies,
  isNow,
  moments,
  store,
}: {
  item: MomentItem;
  replies: MomentItem[];
  isNow: boolean;
  moments: RoomMoments;
  store: PlayerTimeStore;
}) {
  const [threadOpen, setThreadOpen] = useState(false);
  const [replying, setReplying] = useState(false);
  const resolved = item.status === "resolved";
  const confirmed = item.local === null;

  return (
    <li
      className={`flex gap-3 rounded-lg p-2 ${isNow ? "bg-amber-50 dark:bg-amber-950/40" : ""}`}
      aria-current={isNow ? "time" : undefined}
    >
      <button
        type="button"
        onClick={() => store.seek(item.tSec)}
        className="h-fit shrink-0 rounded-md bg-muted px-2 py-1 font-mono text-xs tabular-nums hover:bg-muted/70"
        aria-label={`Jump to ${formatClock(item.tSec)}`}
      >
        {formatClock(item.tSec)}
      </button>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{item.mine ? "You" : item.authorName}</span>
            {item.local === "sending" && <span>sending…</span>}
            {resolved && (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                Resolved
              </span>
            )}
          </p>
          <p
            className={`text-sm break-words whitespace-pre-wrap ${resolved ? "text-muted-foreground" : ""}`}
          >
            {item.body}
          </p>
          <FailedNote item={item} onRetry={moments.retry} />
        </div>

        {confirmed && (
          <div className="flex flex-wrap items-center gap-2">
            <VoteButton item={item} onVote={moments.vote} />
            <button
              type="button"
              aria-expanded={threadOpen}
              onClick={() => setThreadOpen((open) => !open)}
              className="h-8 rounded-md px-2 text-xs font-medium hover:bg-muted"
            >
              {replies.length === 0
                ? "Reply"
                : `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
            </button>
            {item.mine && (
              <button
                type="button"
                onClick={() => moments.resolve(item.id, !resolved)}
                className="h-8 rounded-md px-2 text-xs font-medium hover:bg-muted"
              >
                {resolved ? "Reopen" : "Mark resolved"}
              </button>
            )}
          </div>
        )}

        {threadOpen && (
          <div className="space-y-2 border-l-2 pl-3">
            {replies.length > 0 && (
              <ul className="space-y-2" aria-label="Replies">
                {replies.map((reply) => (
                  <li key={reply.key} className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {reply.mine ? "You" : reply.authorName}
                      {reply.local === "sending" && " · sending…"}
                    </p>
                    <p className="text-sm break-words whitespace-pre-wrap">{reply.body}</p>
                    <FailedNote item={reply} onRetry={moments.retry} />
                    {reply.local === null && <VoteButton item={reply} onVote={moments.vote} />}
                  </li>
                ))}
              </ul>
            )}
            {replying ? (
              <TextComposer
                id={`reply-${item.key}`}
                label="Your reply"
                placeholder="Explain it, or link the part that helped"
                submitLabel="Post reply"
                onClose={() => setReplying(false)}
                onSubmit={(body) => {
                  moments.submit(body, item.tSec, item.id);
                  setReplying(false);
                }}
              />
            ) : (
              <Button variant="outline" className="h-9" onClick={() => setReplying(true)}>
                Write a reply
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function MomentsPanel({
  moments,
  store,
  onComposerOpen,
}: {
  moments: RoomMoments;
  store: PlayerTimeStore;
  // The room shows the Doubts tab when the composer opens (e.g. D pressed on the chat tab).
  onComposerOpen?: () => void;
}) {
  const { items, status, loaded, loadError, notice, clearNotice, reload } = moments;
  const now = usePlayer(store, (s) => Math.floor(s.tSec));
  const [composerAt, setComposerAt] = useState<number | null>(null);
  const askButtonRef = useRef<HTMLButtonElement>(null);

  // The time is captured when the composer opens, not when the doubt is posted.
  function openComposer() {
    setComposerAt(Math.floor(store.getTime()));
    onComposerOpen?.();
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
        onComposerOpen?.();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store, onComposerOpen]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(clearNotice, 4000);
    return () => clearTimeout(timer);
  }, [notice, clearNotice]);

  const topLevel = items.filter((item) => item.parentId === null);
  const repliesOf = (id: string) =>
    items
      .filter((item) => item.parentId === id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

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
        <TextComposer
          id="moment-body"
          label={
            <>
              Your doubt at <span className="font-mono">{formatClock(composerAt)}</span>
            </>
          }
          placeholder="What lost you here?"
          submitLabel="Post doubt"
          onClose={closeComposer}
          onSubmit={(body) => {
            moments.submit(body, composerAt);
            closeComposer();
          }}
        />
      )}

      <p aria-live="polite" className="min-h-0 text-sm text-destructive empty:hidden">
        {notice}
      </p>

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
              replies={repliesOf(item.id)}
              isNow={Math.abs(item.tSec - now) <= NOW_RANGE_SEC}
              moments={moments}
              store={store}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
