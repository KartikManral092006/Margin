import { z } from "zod";

// Who is at which moment: viewers are grouped by 30-second window of the video.
export const PRESENCE_WINDOW_SEC = 30;
// A viewer counts as present for this long after their last heartbeat.
export const PRESENCE_TTL_MS = 45_000;
export const HEARTBEAT_MS = 10_000;
// Names sent per window; the count covers everyone.
export const MAX_NAMES_PER_WINDOW = 6;

export const heartbeatBody = z.strictObject({
  tSec: z.number().finite().min(0).max(86_400),
  playing: z.boolean(),
});

export type Heartbeat = z.infer<typeof heartbeatBody>;

export function presenceWindow(tSec: number): number {
  return Math.floor(Math.max(0, tSec) / PRESENCE_WINDOW_SEC);
}

export type PresenceEntry = { userId: string; name: string; tSec: number; playing: boolean };

export type PresenceWindow = { count: number; names: string[] };

// Snapshot for one viewer, who is never in it: windows keyed by window index.
export type PresenceSnapshot = { windows: Record<string, PresenceWindow>; total: number };

export function buildSnapshot(entries: PresenceEntry[], viewerId: string): PresenceSnapshot {
  const windows: Record<string, PresenceWindow> = {};
  const others = entries.filter((entry) => entry.userId !== viewerId);
  for (const entry of [...others].sort((a, b) => a.name.localeCompare(b.name))) {
    const key = String(presenceWindow(entry.tSec));
    const window = (windows[key] ??= { count: 0, names: [] });
    window.count += 1;
    if (window.names.length < MAX_NAMES_PER_WINDOW) window.names.push(entry.name);
  }
  return { windows, total: others.length };
}

// The other people at my 30-second window.
export function othersHere(
  snapshot: PresenceSnapshot | null,
  tSec: number,
): { count: number; names: string[] } {
  const window = snapshot?.windows[String(presenceWindow(tSec))];
  return window ? { count: window.count, names: window.names } : { count: 0, names: [] };
}

export function describeOthers(others: { count: number; names: string[] }): string {
  if (others.count === 0) return "Nobody else is at this moment right now";
  const shown = others.names.slice(0, 2);
  const rest = others.count - shown.length;
  if (shown.length === 0) {
    return `${others.count} ${others.count === 1 ? "person is" : "people are"} here`;
  }
  if (rest <= 0) return `${shown.join(" and ")} ${others.count === 1 ? "is" : "are"} here`;
  return `${shown.join(", ")} and ${rest} ${rest === 1 ? "other" : "others"} are here`;
}
