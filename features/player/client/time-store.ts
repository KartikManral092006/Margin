// External store for the player's clock. No React import, so it is tested in plain node.
// Day 5 reads getTime() when a doubt is submitted, Day 6 calls seek(), Day 7 selects the
// 30-second window, Day 8 uses play/pause/setRate (rates snap to YouTube's 0.25 steps).

export type PlayerState = "unstarted" | "ended" | "playing" | "paused" | "buffering" | "cued";

export type PlayerSnapshot = Readonly<{
  tSec: number;
  rate: number;
  state: PlayerState;
  ready: boolean;
}>;

export type PlayerAdapter = {
  getCurrentTime(): number;
  getPlaybackRate(): number;
  getAvailablePlaybackRates(): number[];
  setPlaybackRate(rate: number): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getPlayerState(): number;
};

export type Scheduler = {
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
};

export type PlayerTimeStore = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): PlayerSnapshot;
  getServerSnapshot(): PlayerSnapshot;
  getTime(): number;
  seek(seconds: number): void;
  play(): void;
  pause(): void;
  setRate(rate: number): void;
  availableRates(): number[];
  attach(player: PlayerAdapter): void;
  detach(): void;
  onState(code: number): void;
  onRate(rate: number): void;
};

export const POLL_MS = 250;

export const INITIAL_SNAPSHOT: PlayerSnapshot = Object.freeze({
  tSec: 0,
  rate: 1,
  state: "unstarted",
  ready: false,
});

const STATE_BY_CODE: Record<number, PlayerState> = {
  [-1]: "unstarted",
  0: "ended",
  1: "playing",
  2: "paused",
  3: "buffering",
  5: "cued",
};

export function playerStateFromCode(code: number): PlayerState {
  return STATE_BY_CODE[code] ?? "unstarted";
}

// YouTube only accepts rates in 0.25 steps; pick the closest one the video offers.
export function snapRate(rate: number, available: number[]): number {
  const stepped = Math.round(rate * 4) / 4;
  if (available.length === 0) return stepped;
  return available.reduce((best, candidate) =>
    Math.abs(candidate - stepped) < Math.abs(best - stepped) ? candidate : best,
  );
}

const realScheduler: Scheduler = {
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

export function createPlayerTimeStore(scheduler: Scheduler = realScheduler): PlayerTimeStore {
  const listeners = new Set<() => void>();
  let snapshot: PlayerSnapshot = INITIAL_SNAPSHOT;
  let player: PlayerAdapter | null = null;
  let timer: unknown = null;
  // A seek requested before the player is ready (e.g. Day 6 click-to-seek), applied on attach.
  let pendingSeek: number | null = null;

  // A new object only when something changed: useSyncExternalStore needs stable snapshots.
  function update(next: Partial<PlayerSnapshot>) {
    const merged = { ...snapshot, ...next };
    if (
      merged.tSec === snapshot.tSec &&
      merged.rate === snapshot.rate &&
      merged.state === snapshot.state &&
      merged.ready === snapshot.ready
    ) {
      return;
    }
    snapshot = Object.freeze(merged);
    for (const listener of listeners) listener();
  }

  function poll() {
    if (player) update({ tSec: Math.max(0, player.getCurrentTime()) });
  }

  // Polls only while playing and watched, so a paused room costs nothing.
  function syncTimer() {
    const shouldRun = player !== null && listeners.size > 0 && snapshot.state === "playing";
    if (shouldRun && timer === null) {
      timer = scheduler.setInterval(poll, POLL_MS);
    } else if (!shouldRun && timer !== null) {
      scheduler.clearInterval(timer);
      timer = null;
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      syncTimer();
      return () => {
        listeners.delete(listener);
        syncTimer();
      };
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => INITIAL_SNAPSHOT,
    getTime: () => (player ? Math.max(0, player.getCurrentTime()) : snapshot.tSec),
    seek(seconds) {
      const target = Math.max(0, seconds);
      if (player) player.seekTo(target, true);
      else pendingSeek = target;
      update({ tSec: target });
    },
    play: () => player?.playVideo(),
    pause: () => player?.pauseVideo(),
    setRate(rate) {
      if (!player) return;
      player.setPlaybackRate(snapRate(rate, player.getAvailablePlaybackRates()));
    },
    availableRates: () => (player ? player.getAvailablePlaybackRates() : []),
    attach(next) {
      player = next;
      const seekTo = pendingSeek;
      pendingSeek = null;
      if (seekTo !== null) next.seekTo(seekTo, true);
      update({
        ready: true,
        tSec: seekTo ?? Math.max(0, next.getCurrentTime()),
        rate: next.getPlaybackRate(),
        state: playerStateFromCode(next.getPlayerState()),
      });
      syncTimer();
    },
    detach() {
      player = null;
      pendingSeek = null;
      syncTimer();
      update(INITIAL_SNAPSHOT);
    },
    onState(code) {
      update({ state: playerStateFromCode(code) });
      poll();
      syncTimer();
    },
    onRate(rate) {
      update({ rate });
    },
  };
}
