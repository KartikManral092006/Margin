import { describe, expect, it, vi } from "vitest";
import {
  createPlayerTimeStore,
  INITIAL_SNAPSHOT,
  playerStateFromCode,
  IDLE_POLL_MS,
  POLL_MS,
  snapRate,
  type PlayerAdapter,
  type Scheduler,
} from "@/features/player/client/time-store";
import { formatClock } from "@/features/player/shared/format";

function fakeScheduler() {
  const timers = new Map<number, { callback: () => void; ms: number }>();
  let next = 1;
  const scheduler: Scheduler = {
    setInterval: vi.fn((callback: () => void, ms: number) => {
      timers.set(next, { callback, ms });
      return next++;
    }),
    clearInterval: vi.fn((handle: unknown) => {
      timers.delete(handle as number);
    }),
  };
  return {
    scheduler,
    tick: () => timers.forEach((timer) => timer.callback()),
    active: () => timers.size,
    intervals: () => [...timers.values()].map((timer) => timer.ms),
  };
}

function fakePlayer(overrides: Partial<PlayerAdapter> = {}) {
  let time = 0;
  const player: PlayerAdapter & { setTime(t: number): void } = {
    setTime: (t) => {
      time = t;
    },
    getCurrentTime: () => time,
    getDuration: () => 600,
    getPlaybackRate: () => 1,
    getAvailablePlaybackRates: () => [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
    setPlaybackRate: vi.fn(),
    seekTo: vi.fn(),
    playVideo: vi.fn(),
    pauseVideo: vi.fn(),
    getPlayerState: () => -1,
    ...overrides,
  };
  return player;
}

describe("createPlayerTimeStore", () => {
  it("starts with the server snapshot", () => {
    const store = createPlayerTimeStore(fakeScheduler().scheduler);
    expect(store.getSnapshot()).toBe(INITIAL_SNAPSHOT);
    expect(store.getServerSnapshot()).toBe(INITIAL_SNAPSHOT);
  });

  it("keeps the same snapshot reference when nothing changed", () => {
    const { scheduler, tick } = fakeScheduler();
    const store = createPlayerTimeStore(scheduler);
    const player = fakePlayer();
    store.attach(player);
    store.subscribe(() => {});
    store.onState(1);
    const before = store.getSnapshot();
    tick();
    expect(store.getSnapshot()).toBe(before);
    player.setTime(4.5);
    tick();
    expect(store.getSnapshot()).not.toBe(before);
    expect(store.getSnapshot().tSec).toBe(4.5);
  });

  it("polls fast while playing, slowly otherwise, and not at all when nobody watches", () => {
    const { scheduler, active, intervals } = fakeScheduler();
    const store = createPlayerTimeStore(scheduler);
    store.attach(fakePlayer());
    store.onState(1);
    expect(active()).toBe(0); // no listener yet
    const unsubscribe = store.subscribe(() => {});
    expect(intervals()).toEqual([POLL_MS]);
    store.onState(2);
    expect(intervals()).toEqual([IDLE_POLL_MS]); // paused: still notices YouTube's seek bar
    store.onState(1);
    expect(intervals()).toEqual([POLL_MS]);
    unsubscribe();
    expect(active()).toBe(0); // last listener gone
  });

  it("trusts a seek target while YouTube still reports the old time", () => {
    const { scheduler, tick } = fakeScheduler();
    let clock = 1000;
    const store = createPlayerTimeStore(scheduler, () => clock);
    const player = fakePlayer();
    store.attach(player);
    store.subscribe(() => {});
    store.seek(1800);
    player.setTime(0); // stale report right after the seek
    tick();
    expect(store.getSnapshot().tSec).toBe(1800);
    player.setTime(1800.4); // the seek landed
    tick();
    expect(store.getSnapshot().tSec).toBe(1800.4);
    clock += 3000; // settled: the player is trusted again
    player.setTime(12);
    tick();
    expect(store.getSnapshot().tSec).toBe(12);
  });

  it("reports the duration once YouTube knows it", () => {
    const store = createPlayerTimeStore(fakeScheduler().scheduler);
    expect(store.getSnapshot().duration).toBeNull();
    store.attach(fakePlayer());
    expect(store.getSnapshot().duration).toBe(600);
  });

  it("stops polling and resets on detach", () => {
    const { scheduler, active } = fakeScheduler();
    const store = createPlayerTimeStore(scheduler);
    store.attach(fakePlayer());
    store.subscribe(() => {});
    store.onState(1);
    store.detach();
    expect(active()).toBe(0);
    expect(store.getSnapshot()).toEqual(INITIAL_SNAPSHOT);
  });

  it("seek moves the player and the clock at once", () => {
    const store = createPlayerTimeStore(fakeScheduler().scheduler);
    const player = fakePlayer();
    store.attach(player);
    store.seek(1800);
    expect(player.seekTo).toHaveBeenCalledWith(1800, true);
    expect(store.getSnapshot().tSec).toBe(1800);
    store.seek(-5);
    expect(store.getSnapshot().tSec).toBe(0);
  });

  it("applies a seek made before the player was ready once it attaches", () => {
    const store = createPlayerTimeStore(fakeScheduler().scheduler);
    store.seek(90);
    expect(store.getSnapshot().tSec).toBe(90);
    const player = fakePlayer();
    store.attach(player);
    expect(player.seekTo).toHaveBeenCalledWith(90, true);
    expect(store.getSnapshot().tSec).toBe(90);
  });

  it("forgets a pending seek when the player goes away", () => {
    const store = createPlayerTimeStore(fakeScheduler().scheduler);
    store.seek(90);
    store.detach();
    const player = fakePlayer();
    store.attach(player);
    expect(player.seekTo).not.toHaveBeenCalled();
  });

  it("getTime reads the player directly", () => {
    const store = createPlayerTimeStore(fakeScheduler().scheduler);
    expect(store.getTime()).toBe(0);
    const player = fakePlayer();
    store.attach(player);
    player.setTime(12.3);
    expect(store.getTime()).toBe(12.3);
  });

  it("snaps rates to YouTube's steps", () => {
    const store = createPlayerTimeStore(fakeScheduler().scheduler);
    const player = fakePlayer();
    store.attach(player);
    store.setRate(1.3);
    expect(player.setPlaybackRate).toHaveBeenCalledWith(1.25);
    store.onRate(1.25);
    expect(store.getSnapshot().rate).toBe(1.25);
  });

  it("notifies listeners on change only", () => {
    const store = createPlayerTimeStore(fakeScheduler().scheduler);
    const listener = vi.fn();
    store.subscribe(listener);
    store.onRate(1);
    expect(listener).not.toHaveBeenCalled();
    store.onRate(1.5);
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe("snapRate", () => {
  it.each([
    [1.3, [0.5, 1, 1.25, 1.5], 1.25],
    [0.8, [0.5, 1, 1.25], 0.5], // 0.75 ties between 0.5 and 1: the slower rate wins
    [1.1, [], 1],
    [2.4, [0.25, 1, 2], 2],
  ])("%s with %j -> %s", (rate, available, expected) => {
    expect(snapRate(rate, available)).toBe(expected);
  });
});

describe("playerStateFromCode", () => {
  it.each([
    [-1, "unstarted"],
    [0, "ended"],
    [1, "playing"],
    [2, "paused"],
    [3, "buffering"],
    [5, "cued"],
    [42, "unstarted"],
  ] as const)("%s -> %s", (code, state) => {
    expect(playerStateFromCode(code)).toBe(state);
  });
});

describe("formatClock", () => {
  it.each([
    [0, "0:00"],
    [75.9, "1:15"],
    [3723, "1:02:03"],
    [-3, "0:00"],
  ])("%s -> %s", (seconds, expected) => {
    expect(formatClock(seconds)).toBe(expected);
  });
});
