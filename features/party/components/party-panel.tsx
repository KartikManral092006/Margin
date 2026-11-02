"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "@/features/chat/components/chat-panel";
import type { useParty } from "@/features/party/client/use-party";
import { IN_SYNC_SEC } from "@/features/party/shared/sync";

export type Party = ReturnType<typeof useParty>;

function SyncBadge({ drift }: { drift: number | null }) {
  if (drift === null) return <span className="text-muted-foreground">Syncing…</span>;
  const size = Math.abs(drift);
  const inSync = size < IN_SYNC_SEC;
  return (
    <span
      className={
        inSync ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"
      }
    >
      {inSync ? "In sync" : drift > 0 ? "Slightly ahead, easing back" : "Catching up"} (
      {drift >= 0 ? "+" : "−"}
      {size.toFixed(1)} s)
    </span>
  );
}

// Shown above the room tabs when someone else hosts a party I haven't joined.
export function PartyBanner({ party, onOpen }: { party: Party; onOpen: () => void }) {
  if (!party.party || party.party.isHost || party.joined) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm dark:border-sky-800 dark:bg-sky-950/40">
      <span>
        <span className="font-medium">{party.party.hostName}</span> is hosting a watch party
      </span>
      <Button size="sm" className="h-9" onClick={onOpen}>
        Join party
      </Button>
    </div>
  );
}

export function PartyPanel({ lectureId, party }: { lectureId: string; party: Party }) {
  const [busy, setBusy] = useState(false);
  const run = (action: () => Promise<void> | void) => async () => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };
  const current = party.party;

  if (!current) {
    return (
      <section className="flex flex-col gap-3" aria-label="Watch party">
        <p className="text-sm text-muted-foreground">
          Watch together: as host, your play, pause and jumps move everyone who joins, and you get a
          party chat.
        </p>
        <Button className="h-11 w-full sm:w-auto" disabled={busy} onClick={run(party.start)}>
          {busy ? "Starting…" : "Start a watch party"}
        </Button>
        {party.error && <p className="text-sm text-destructive">{party.error}</p>}
      </section>
    );
  }

  const inParty = current.isHost || party.joined;
  return (
    <section className="flex flex-col gap-3" aria-label="Watch party">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        {current.isHost ? (
          <p>
            <span className="font-medium">You&apos;re hosting.</span> Everyone who joins follows
            your play, pause and jumps.
          </p>
        ) : party.joined ? (
          <p aria-live="polite">
            Following <span className="font-medium">{current.hostName}</span> ·{" "}
            <SyncBadge drift={party.drift} />
          </p>
        ) : (
          <p>
            <span className="font-medium">{current.hostName}</span> is hosting a watch party.
          </p>
        )}
        {current.isHost ? (
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={busy}
            onClick={run(party.end)}
          >
            End party
          </Button>
        ) : party.joined ? (
          <Button variant="outline" size="sm" className="h-9" onClick={party.leave}>
            Leave party
          </Button>
        ) : (
          <Button size="sm" className="h-9" disabled={busy} onClick={run(party.join)}>
            Join party
          </Button>
        )}
      </div>
      {party.error && <p className="text-sm text-destructive">{party.error}</p>}
      {inParty && (
        <ChatPanel
          lectureId={lectureId}
          channelId={current.channelId}
          kind="open"
          canSend={party.channelReady}
          label="Party chat"
          placeholder="Message the party"
        />
      )}
    </section>
  );
}
