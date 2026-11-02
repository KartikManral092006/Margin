"use client";

import { estimateOffset, type ClockSample } from "@/features/party/shared/sync";

const SAMPLES = 5;
// A best estimate older than this is replaced even by a slower sample (clocks drift slowly).
const MAX_AGE_MS = 10 * 60_000;

// The best estimate so far: the smallest round trip gives the smallest possible error
// (at most half the round trip), so a slow, busy moment never replaces a good reading.
let best: { offsetMs: number; rttMs: number; at: number } | null = null;
let measuring: Promise<number> | null = null;

async function sample(): Promise<ClockSample | null> {
  const sentAt = Date.now();
  try {
    const response = await fetch("/api/time", { cache: "no-store" });
    const receivedAt = Date.now();
    const body = (await response.json()) as { now?: number };
    return typeof body.now === "number" ? { sentAt, serverNow: body.now, receivedAt } : null;
  } catch {
    return null;
  }
}

// Takes 5 samples and keeps the result if it beats (or replaces a stale) best estimate.
// Watch parties call this again every 30 s, so a bad first reading is corrected.
export function syncServerClock(): Promise<number> {
  measuring ??= (async () => {
    const samples: ClockSample[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const next = await sample();
      if (next) samples.push(next);
    }
    const estimate = estimateOffset(samples);
    const now = Date.now();
    if (estimate && (!best || estimate.rttMs <= best.rttMs || now - best.at > MAX_AGE_MS)) {
      best = { ...estimate, at: now };
    }
    measuring = null;
    return best?.offsetMs ?? 0;
  })();
  return measuring;
}

// The server's current time in ms, as well as this browser can tell.
export function serverNow(): number {
  return Date.now() + (best?.offsetMs ?? 0);
}

// Good to about a second: the error is at most half the round trip.
const TRUSTED_RTT_MS = 2000;

export function clockTrusted(): boolean {
  return best !== null && best.rttMs <= TRUSTED_RTT_MS;
}
