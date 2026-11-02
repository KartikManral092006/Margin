"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { createPlayerTimeStore, type PlayerTimeStore } from "@/features/player/client/time-store";
import { usePlayer } from "@/features/player/client/use-player";
import { PLAYER_ERROR } from "@/features/player/client/yt-types";
import { YouTubePlayer } from "@/features/player/components/youtube-player";
import { formatClock } from "@/features/player/shared/format";
import type { LectureSummary } from "@/features/lectures/shared/schemas";
import { canonicalWatchUrl } from "@/features/lectures/shared/youtube";
import { MomentsPanel } from "@/features/moments/components/moments-panel";

type RoomContextValue = { lecture: LectureSummary; store: PlayerTimeStore };

const RoomContext = createContext<RoomContextValue | null>(null);

// For Days 5-8: the composer, timeline, presence and party controls read the room from here.
export function useRoom(): RoomContextValue {
  const room = useContext(RoomContext);
  if (!room) throw new Error("useRoom must be used inside RoomClient");
  return room;
}

const PLAYER_ERROR_TEXT: Record<number, string> = {
  [PLAYER_ERROR.INVALID_PARAM]: "This video can't be played here.",
  [PLAYER_ERROR.HTML5]: "The video player hit a problem.",
  [PLAYER_ERROR.NOT_FOUND]: "This video was removed or made private.",
  [PLAYER_ERROR.NO_EMBED]: "The owner doesn't allow this video to play on other sites.",
  [PLAYER_ERROR.NO_EMBED_ALT]: "The owner doesn't allow this video to play on other sites.",
  [PLAYER_ERROR.NO_REFERRER]: "The video player couldn't verify this site.",
  [PLAYER_ERROR.LOADER_FAILED]: "YouTube's player didn't load. Check your connection.",
};

function Clock({ store }: { store: PlayerTimeStore }) {
  const seconds = usePlayer(store, (snapshot) => Math.floor(snapshot.tSec));
  return (
    <span className="font-mono text-sm tabular-nums" aria-label="Current video time">
      {formatClock(seconds)}
    </span>
  );
}

type JoinState = "joining" | "joined" | "failed";

export function RoomClient({
  lecture,
  startSec,
}: {
  lecture: LectureSummary;
  startSec: number | null;
}) {
  const [store] = useState(() => createPlayerTimeStore());
  const [memberCount, setMemberCount] = useState(lecture.memberCount);
  const [joinState, setJoinState] = useState<JoinState>("joining");
  const [playerError, setPlayerError] = useState<number | null>(null);
  const [playerKey, setPlayerKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const joinStarted = useRef(false);

  const join = useCallback(async () => {
    try {
      const response = await fetch(`/api/lectures/${lecture.id}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error(`join failed: ${response.status}`);
      const body = (await response.json()) as { memberCount: number };
      setMemberCount(body.memberCount);
      setJoinState("joined");
    } catch {
      setJoinState("failed");
    }
  }, [lecture.id]);

  // Once per mount; the route is idempotent anyway (StrictMode mounts effects twice in dev).
  useEffect(() => {
    if (joinStarted.current) return;
    joinStarted.current = true;
    void join();
  }, [join]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/lectures/${lecture.id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const errorText =
    playerError === null
      ? null
      : (PLAYER_ERROR_TEXT[playerError] ?? PLAYER_ERROR_TEXT[PLAYER_ERROR.HTML5]);
  const embedBlocked =
    playerError === PLAYER_ERROR.NO_EMBED || playerError === PLAYER_ERROR.NO_EMBED_ALT;

  return (
    <RoomContext.Provider value={{ lecture, store }}>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 pb-10 sm:px-4 sm:pt-6">
        {errorText ? (
          <div
            role="alert"
            className="flex aspect-video min-h-[200px] w-full flex-col items-center justify-center gap-3 bg-muted px-4 text-center"
          >
            <p className="text-sm">{errorText}</p>
            {embedBlocked ? (
              <Button asChild variant="outline" className="h-11">
                <a href={canonicalWatchUrl(lecture.youtubeId)} target="_blank" rel="noreferrer">
                  Open on YouTube
                </a>
              </Button>
            ) : (
              <Button
                variant="outline"
                className="h-11"
                onClick={() => {
                  setPlayerError(null);
                  setPlayerKey((key) => key + 1);
                }}
              >
                Try again
              </Button>
            )}
          </div>
        ) : (
          <YouTubePlayer
            key={playerKey}
            videoId={lecture.youtubeId}
            startSec={startSec}
            store={store}
            onError={setPlayerError}
          />
        )}

        <section className="flex flex-col gap-3 px-4 sm:px-0">
          <div className="space-y-1">
            <h1 className="line-clamp-2 text-lg font-semibold text-balance sm:text-xl">
              {lecture.title}
            </h1>
            <p className="truncate text-sm text-muted-foreground">{lecture.channelName}</p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <Clock store={store} />
            <span aria-live="polite">
              {memberCount} {memberCount === 1 ? "person" : "people"} joined
            </span>
            <Button variant="outline" size="sm" className="h-9" onClick={copyLink}>
              {copied ? "Link copied" : "Copy link"}
            </Button>
          </div>

          {joinState === "failed" && (
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t join this room.{" "}
              <button
                type="button"
                className="font-medium text-foreground underline underline-offset-4"
                onClick={() => {
                  setJoinState("joining");
                  void join();
                }}
              >
                Retry
              </button>
            </p>
          )}
          {joinState === "joined" && memberCount === 1 && (
            <p className="text-sm text-muted-foreground">
              You&apos;re the first one here. Share the link with your class.
            </p>
          )}
        </section>

        <div className="px-4 sm:px-0">
          <MomentsPanel lectureId={lecture.id} store={store} />
        </div>
      </main>
    </RoomContext.Provider>
  );
}
