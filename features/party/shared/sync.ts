import { z } from "zod";

// --- Server clock -------------------------------------------------------------------------
// Laptop clocks often differ by 0.5-3 s, as big as the corrections below, so all party times
// are server times. A client estimates its offset NTP-style from a few GET /api/time samples.

export type ClockSample = { sentAt: number; serverNow: number; receivedAt: number };

// The sample with the smallest round trip is the least distorted by network delay; the
// server's reading is assumed to be from the middle of that round trip.
export function estimateOffset(samples: ClockSample[]): { offsetMs: number; rttMs: number } | null {
  const best = samples
    .filter((s) => s.receivedAt >= s.sentAt)
    .sort((a, b) => a.receivedAt - a.sentAt - (b.receivedAt - b.sentAt))[0];
  if (!best) return null;
  const rttMs = best.receivedAt - best.sentAt;
  return { offsetMs: best.serverNow + rttMs / 2 - best.receivedAt, rttMs };
}

// --- Party state ----------------------------------------------------------------------------

export const SYNC_HEARTBEAT_MS = 5000;

export const partyStateSchema = z.strictObject({
  action: z.enum(["play", "pause", "seek", "rate", "heartbeat"]),
  tSec: z.number().finite().min(0).max(86_400),
  playing: z.boolean(),
  // The host's playback rate (lectures are often watched at 1.5x or 2x).
  rate: z.number().finite().min(0.25).max(2).default(1),
  // Server-clock time (ms) at which the host was at tSec.
  hostSentAt: z.number().int().positive(),
});

export type PartyState = z.infer<typeof partyStateSchema>;

// Where the host is now: a playing host has moved on by the time since hostSentAt, at its rate.
export function expectedPosition(state: PartyState, serverNow: number): number {
  if (!state.playing) return state.tSec;
  return state.tSec + (state.rate * Math.max(0, serverNow - state.hostSentAt)) / 1000;
}

// --- Drift correction -----------------------------------------------------------------------
// YouTube only plays at 0.25 steps, so a small drift is closed by playing 0.25 faster (behind)
// or slower (ahead) than the host for exactly as long as it takes: |drift| / 0.25 seconds.

export const IN_SYNC_SEC = 0.5;
export const SEEK_ABOVE_SEC = 2;
const CATCH_UP_DELTA = 0.25;
const MIN_RATE = 0.25;
const MAX_RATE = 2;

export type Correction =
  | { action: "none" }
  | { action: "rate"; rate: number; durationMs: number }
  | { action: "seek"; to: number };

// drift = viewer - host, in seconds (positive: the viewer is ahead). hostRate is the speed the
// viewer normally plays at; a catch-up speed YouTube doesn't have (above 2x) means a seek.
export function correction(drift: number, expected: number, hostRate = 1): Correction {
  const size = Math.abs(drift);
  if (size < IN_SYNC_SEC) return { action: "none" };
  const rate = hostRate + (drift > 0 ? -CATCH_UP_DELTA : CATCH_UP_DELTA);
  if (size > SEEK_ABOVE_SEC || rate < MIN_RATE || rate > MAX_RATE) {
    return { action: "seek", to: Math.max(0, expected) };
  }
  return { action: "rate", rate, durationMs: Math.round((size / CATCH_UP_DELTA) * 1000) };
}

// What a viewer should do now. A paused host means: pause, and seek if not at the same spot.
// The host can't be past the end of the video, and a viewer whose video ended near where the
// host is stays there (YouTube restarts an ended video from 0 when told to play).
export function followPlan(input: {
  state: PartyState;
  serverNow: number;
  viewerTime: number;
  viewerPlaying: boolean;
  duration?: number | null;
  viewerEnded?: boolean;
}): { playing: boolean; correction: Correction; drift: number } {
  const projected = expectedPosition(input.state, input.serverNow);
  const expected = input.duration ? Math.min(projected, input.duration) : projected;
  const drift = input.viewerTime - expected;
  if (input.viewerEnded && input.duration && expected >= input.duration - SEEK_ABOVE_SEC) {
    return { playing: false, correction: { action: "none" }, drift: 0 };
  }
  if (!input.state.playing) {
    return {
      playing: false,
      correction:
        Math.abs(drift) > IN_SYNC_SEC ? { action: "seek", to: expected } : { action: "none" },
      drift,
    };
  }
  return { playing: true, correction: correction(drift, expected, input.state.rate), drift };
}

// A state older than this means the host is gone; the party ends.
export const PARTY_STALE_MS = 120_000;
// No party runs longer than this, so nobody can hold a lecture's one party slot for good.
export const PARTY_MAX_MS = 4 * 60 * 60_000;
