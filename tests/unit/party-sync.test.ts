import { describe, expect, it } from "vitest";
import {
  createFollower,
  INITIAL_LOAD_SEC,
  SEEK_COOLDOWN_MS,
  type PlayerControl,
} from "@/features/party/shared/follower";
import {
  correction,
  estimateOffset,
  expectedPosition,
  followPlan,
  partyStateSchema,
  type PartyState,
} from "@/features/party/shared/sync";

describe("estimateOffset", () => {
  it("uses the fastest round trip and assumes the server read halfway through it", () => {
    const result = estimateOffset([
      { sentAt: 1000, serverNow: 5600, receivedAt: 1400 }, // slow
      { sentAt: 2000, serverNow: 6050, receivedAt: 2100 }, // fastest: offset 6050+50-2100
      { sentAt: 3000, serverNow: 7300, receivedAt: 3250 },
    ]);
    expect(result).toEqual({ offsetMs: 4000, rttMs: 100 });
  });

  it("returns null without usable samples", () => {
    expect(estimateOffset([])).toBeNull();
    expect(estimateOffset([{ sentAt: 10, serverNow: 0, receivedAt: 5 }])).toBeNull();
  });
});

describe("expectedPosition", () => {
  const state: PartyState = {
    action: "heartbeat",
    tSec: 100,
    playing: true,
    rate: 1,
    hostSentAt: 10_000,
  };
  it("moves on with the server clock while playing, stays put when paused", () => {
    expect(expectedPosition(state, 12_500)).toBe(102.5);
    expect(expectedPosition({ ...state, playing: false }, 12_500)).toBe(100);
    expect(expectedPosition(state, 9_000)).toBe(100); // never backwards
  });
  it("moves at the host's rate", () => {
    expect(expectedPosition({ ...state, rate: 2 }, 12_500)).toBe(105);
  });
  it("treats a state without a rate as 1x", () => {
    const { rate: _rate, ...old } = state;
    expect(partyStateSchema.parse(old).rate).toBe(1);
  });
});

describe("correction", () => {
  it.each([
    [0.3, { action: "none" }],
    [-0.49, { action: "none" }],
    [0.8, { action: "rate", rate: 0.75, durationMs: 3200 }], // ahead: slow down
    [-1.5, { action: "rate", rate: 1.25, durationMs: 6000 }], // behind: speed up
    [2.5, { action: "seek", to: 50 }],
    [-30, { action: "seek", to: 50 }],
  ])("drift %s s -> %j", (drift, expected) => {
    expect(correction(drift, 50)).toEqual(expected);
  });
  it("catches up relative to the host's rate", () => {
    expect(correction(-1, 50, 1.5)).toEqual({ action: "rate", rate: 1.75, durationMs: 4000 });
    expect(correction(1, 50, 2)).toEqual({ action: "rate", rate: 1.75, durationMs: 4000 });
    // 2.25x doesn't exist on YouTube: seek instead.
    expect(correction(-1, 50, 2)).toEqual({ action: "seek", to: 50 });
  });
});

describe("followPlan", () => {
  const state: PartyState = { action: "pause", tSec: 40, playing: false, rate: 1, hostSentAt: 1 };
  it("pauses with a paused host, seeking only when not at the same spot", () => {
    expect(followPlan({ state, serverNow: 5, viewerTime: 40.2, viewerPlaying: true })).toEqual({
      playing: false,
      correction: { action: "none" },
      drift: expect.closeTo(0.2, 5),
    });
    expect(
      followPlan({ state, serverNow: 5, viewerTime: 45, viewerPlaying: false }).correction,
    ).toEqual({
      action: "seek",
      to: 40,
    });
  });
  it("never follows the host past the end, and leaves an ended viewer there", () => {
    const playing: PartyState = { ...state, playing: true, tSec: 595 };
    const nearEnd = { state: playing, serverNow: 20_000, duration: 600 };
    // The host would be at 615 s of a 600 s video: expected is capped at 600.
    expect(followPlan({ ...nearEnd, viewerTime: 600, viewerPlaying: false }).drift).toBe(0);
    expect(
      followPlan({ ...nearEnd, viewerTime: 600, viewerPlaying: false, viewerEnded: true }),
    ).toEqual({ playing: false, correction: { action: "none" }, drift: 0 });
    // Ended but the host is far from the end: follow (play and seek back).
    const early = { ...nearEnd, state: { ...playing, tSec: 100 } };
    expect(
      followPlan({ ...early, viewerTime: 600, viewerPlaying: false, viewerEnded: true }).playing,
    ).toBe(true);
  });
});

// --- 10-minute simulation: a host and two viewers --------------------------------------------
// Deterministic "random" numbers so the test is repeatable.
function rng(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

type SimPlayer = PlayerControl & { advance(dtSec: number): void; position(): number };

// A player with YouTube's quirks: seeks stall playback for a while (buffering), and a rate
// change takes effect only after a short delay.
function simPlayer(random: () => number): SimPlayer {
  let pos = 0;
  let playing = false;
  let rate = 1;
  let pendingRate: { rate: number; inSec: number } | null = null;
  let stallSec = 0;
  return {
    time: () => pos,
    position: () => pos,
    playing: () => playing,
    ended: () => false,
    duration: () => null,
    play: () => {
      playing = true;
    },
    pause: () => {
      playing = false;
    },
    seek: (to) => {
      pos = to;
      stallSec = 0.3 + random() * 0.9; // 0.3-1.2 s of buffering
    },
    setRate: (r) => {
      pendingRate = { rate: r, inSec: 0.1 + random() * 0.2 };
    },
    advance(dt) {
      if (pendingRate) {
        pendingRate.inSec -= dt;
        if (pendingRate.inSec <= 0) {
          rate = pendingRate.rate;
          pendingRate = null;
        }
      }
      if (!playing) return;
      if (stallSec > 0) {
        stallSec -= dt;
        return;
      }
      pos += dt * rate;
    },
  };
}

function simulate(seed: number, hostRate = 1) {
  const random = rng(seed);
  const dt = 0.1; // seconds per tick
  const totalSec = 600;
  // The host plays from 0:00, pauses at 2:00 for 20 s, jumps to 7:00 at 4:00.
  let hostPos = 0;
  let hostPlaying = true;
  const hostOffsetErrMs = 80; // the host's clock estimate is 80 ms off
  const viewers = [
    { offsetErrMs: -120, baseLatencyMs: 150, jitterMs: 400 },
    { offsetErrMs: 60, baseLatencyMs: 600, jitterMs: 900 }, // slow phone on a bad network
  ].map((cfg) => ({
    ...cfg,
    player: simPlayer(random),
    follower: null as ReturnType<typeof createFollower> | null,
    latest: null as PartyState | null,
    inbox: [] as { deliverAtSec: number; state: PartyState }[],
    maxDrift: 0,
  }));
  for (const v of viewers) v.follower = createFollower(v.player);

  let nextBeatSec = 0;
  const send = (action: PartyState["action"], t: number) => {
    const state: PartyState = {
      action,
      tSec: hostPos,
      playing: hostPlaying,
      rate: hostRate,
      hostSentAt: Math.round(t * 1000 + hostOffsetErrMs),
    };
    for (const v of viewers) {
      const latencySec = (v.baseLatencyMs + random() * v.jitterMs) / 1000;
      v.inbox.push({ deliverAtSec: t + latencySec, state });
    }
  };

  for (let tick = 0; tick * dt < totalSec; tick++) {
    const t = tick * dt;
    if (Math.abs(t - 120) < dt / 2) {
      hostPlaying = false;
      send("pause", t);
    }
    if (Math.abs(t - 140) < dt / 2) {
      hostPlaying = true;
      send("play", t);
    }
    if (Math.abs(t - 240) < dt / 2) {
      hostPos = 420;
      send("seek", t);
    }
    if (t >= nextBeatSec) {
      send("heartbeat", t);
      nextBeatSec = t + 5;
    }
    if (hostPlaying) hostPos += dt * hostRate;

    for (const v of viewers) {
      // Messages arrive in order of delivery time.
      v.inbox.sort((a, b) => a.deliverAtSec - b.deliverAtSec);
      let arrived = false;
      while (v.inbox[0] && v.inbox[0].deliverAtSec <= t) {
        v.latest = v.inbox.shift()!.state;
        arrived = true;
      }
      const onSecond = Math.abs((t % 1) - 0) < dt / 2;
      if (v.latest && (arrived || onSecond)) {
        v.follower!.step(v.latest, t * 1000, Math.round(t * 1000 + v.offsetErrMs));
      }
      v.player.advance(dt);
      // Judge only steady state: not within 6 s of a host pause, play or jump.
      const settling = [120, 140, 240].some((at) => t >= at && t < at + 6) || t < 6;
      if (!settling) v.maxDrift = Math.max(v.maxDrift, Math.abs(v.player.position() - hostPos));
    }
  }
  return viewers.map((v) => v.maxDrift);
}

describe("createFollower", () => {
  // YouTube after a long jump: still loading, and reporting the old time.
  function loadingPlayer() {
    const seeks: number[] = [];
    const control: PlayerControl = {
      time: () => 38,
      playing: () => true,
      ended: () => false,
      duration: () => null,
      play: () => {},
      pause: () => {},
      seek: (to) => seeks.push(to),
      setRate: () => {},
    };
    return { control, seeks };
  }
  const playingAt = (tSec: number, hostSentAt: number): PartyState => ({
    action: "seek",
    tSec,
    playing: true,
    rate: 1,
    hostSentAt,
  });

  it("seeks once while the player loads, not every step", () => {
    const { control, seeks } = loadingPlayer();
    const follower = createFollower(control);
    const state = playingAt(420, 10_000);
    for (let ms = 10_000; ms < 10_000 + SEEK_COOLDOWN_MS; ms += 1000) {
      follower.step(state, ms, ms);
    }
    expect(seeks).toEqual([420 + INITIAL_LOAD_SEC]); // aims ahead by the expected loading time
    // Still stuck after the cooldown: seek again.
    follower.step(state, 10_000 + SEEK_COOLDOWN_MS, 10_000 + SEEK_COOLDOWN_MS);
    expect(seeks).toHaveLength(2);
  });

  it("follows a new host jump at once, even during the cooldown", () => {
    const { control, seeks } = loadingPlayer();
    const follower = createFollower(control);
    follower.step(playingAt(420, 10_000), 10_000, 10_000);
    follower.step(playingAt(900, 11_000), 11_000, 11_000);
    expect(seeks).toEqual([420 + INITIAL_LOAD_SEC, 900 + INITIAL_LOAD_SEC]);
  });
});

describe("createFollower rates and the end of the video", () => {
  function recorder(overrides: Partial<PlayerControl> = {}) {
    const calls: string[] = [];
    const control: PlayerControl = {
      time: () => 100,
      playing: () => true,
      ended: () => false,
      duration: () => null,
      play: () => calls.push("play"),
      pause: () => calls.push("pause"),
      seek: (to) => calls.push(`seek ${to}`),
      setRate: (rate) => calls.push(`rate ${rate}`),
      ...overrides,
    };
    return { control, calls };
  }
  const state: PartyState = { action: "rate", tSec: 100, playing: true, rate: 2, hostSentAt: 1 };

  it("plays at the host's rate, and back at 1x after leaving", () => {
    const { control, calls } = recorder();
    const follower = createFollower(control);
    follower.step(state, 1, 1);
    expect(calls).toEqual(["rate 2"]);
    follower.stop();
    expect(calls).toEqual(["rate 2", "rate 1"]);
  });

  it("doesn't restart a viewer whose video ended with the host's", () => {
    const { control, calls } = recorder({
      time: () => 600,
      playing: () => false,
      ended: () => true,
      duration: () => 600,
    });
    createFollower(control).step({ ...state, tSec: 599, rate: 1 }, 5000, 5000);
    expect(calls).toEqual([]);
  });
});

describe("watch party simulation (host + two viewers, 10 minutes)", () => {
  it.each([1, 2, 3, 4, 5])("keeps both viewers within 1 s of the host (seed %s)", (seed) => {
    const [first, second] = simulate(seed);
    expect(first).toBeLessThan(1);
    expect(second).toBeLessThan(1);
  });
  it.each([1.5, 2])("keeps both viewers within 1 s of a host at %sx", (rate) => {
    for (const seed of [1, 2, 3]) {
      const [first, second] = simulate(seed, rate);
      expect(first).toBeLessThan(1);
      expect(second).toBeLessThan(1);
    }
  });
});
