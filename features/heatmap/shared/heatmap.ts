import { z } from "zod";

// "I'm lost" reactions are counted per 15-second bucket (bucket = floor(tSec / 15)); each
// person counts once per bucket, so a count is a number of people.
export const LOST_BUCKET_SEC = 15;
// Videos longer than a day don't exist on YouTube; this also bounds the bucket number.
const MAX_SEC = 86_400;
// Others see a spot only once this many people marked it, so one viewer's "I'm lost" can't be
// tied to them by the named presence line ("Ana is here") the moment the count changes.
export const MIN_PEOPLE_SHOWN = 2;
// The bar shows at most this many heat bins, so a long lecture's 15-second buckets don't
// shrink to hairlines (each bin shows its busiest bucket).
const MAX_BINS = 90;

export const lostBody = z.strictObject({ tSec: z.number().finite().min(0).max(MAX_SEC) });

export type HeatBucket = { bucket: number; count: number };
export type Heatmap = { version: number; buckets: HeatBucket[] };

export function lostBucket(tSec: number): number {
  return Math.floor(Math.min(MAX_SEC, Math.max(0, tSec)) / LOST_BUCKET_SEC);
}

export function bucketStart(bucket: number): number {
  return bucket * LOST_BUCKET_SEC;
}

// What other viewers may see: buckets at least MIN_PEOPLE_SHOWN people marked.
export function publicHeatmap(heatmap: Heatmap): Heatmap {
  return { ...heatmap, buckets: heatmap.buckets.filter((b) => b.count >= MIN_PEOPLE_SHOWN) };
}

// My own marks always show to me: a bucket hidden from the public counts with my mark in it
// has exactly one person in it, me (a shown one already counts me).
export function withMine(buckets: HeatBucket[], mine: number[]): HeatBucket[] {
  const shown = new Set(buckets.map((b) => b.bucket));
  const extra = mine.filter((bucket) => !shown.has(bucket)).map((bucket) => ({ bucket, count: 1 }));
  return extra.length === 0 ? buckets : [...buckets, ...extra].sort((a, b) => a.bucket - b.bucket);
}

// How hot each part of the bar looks, 0-1, relative to the busiest. Buckets are grouped into
// bins of whole buckets (at most MAX_BINS across the video); a bin shows its busiest bucket.
// The square root keeps one person visible next to 20 without flattening real differences.
export function heatLevels(
  buckets: HeatBucket[],
  durationSec: number,
): { startSec: number; endSec: number; count: number; level: number }[] {
  const binSec = Math.max(1, Math.ceil(durationSec / MAX_BINS / LOST_BUCKET_SEC)) * LOST_BUCKET_SEC;
  const bins = new Map<number, number>();
  for (const b of buckets) {
    const start = bucketStart(b.bucket);
    if (b.count <= 0 || start >= durationSec) continue;
    const bin = Math.floor(start / binSec);
    bins.set(bin, Math.max(bins.get(bin) ?? 0, b.count));
  }
  const max = Math.max(0, ...bins.values());
  if (max === 0) return [];
  return [...bins]
    .map(([bin, count]) => ({
      startSec: bin * binSec,
      endSec: Math.min(durationSec, (bin + 1) * binSec),
      count,
      level: Math.sqrt(count / max),
    }))
    .sort((a, b) => a.startSec - b.startSec);
}

// The most confusing stretch: the busiest bucket (the earliest on a tie), widened over
// neighbouring buckets that are at least half as busy.
export function hottestStretch(
  buckets: HeatBucket[],
): { startSec: number; endSec: number; peak: number } | null {
  const counts = new Map(buckets.filter((b) => b.count > 0).map((b) => [b.bucket, b.count]));
  let peakBucket = -1;
  let peak = 0;
  for (const [bucket, count] of counts) {
    if (count > peak || (count === peak && bucket < peakBucket)) {
      peak = count;
      peakBucket = bucket;
    }
  }
  if (peak === 0) return null;
  const hot = (bucket: number) => (counts.get(bucket) ?? 0) * 2 >= peak;
  let first = peakBucket;
  let last = peakBucket;
  while (hot(first - 1)) first--;
  while (hot(last + 1)) last++;
  return { startSec: bucketStart(first), endSec: bucketStart(last + 1), peak };
}

// The viewer's own reaction added or removed, for the moment before the server confirms.
export function adjustBucket(buckets: HeatBucket[], bucket: number, delta: 1 | -1): HeatBucket[] {
  const found = buckets.some((b) => b.bucket === bucket);
  const next = found
    ? buckets.map((b) => (b.bucket === bucket ? { bucket, count: b.count + delta } : b))
    : delta > 0
      ? [...buckets, { bucket, count: 1 }]
      : buckets;
  return next.filter((b) => b.count > 0).sort((a, b) => a.bucket - b.bucket);
}
