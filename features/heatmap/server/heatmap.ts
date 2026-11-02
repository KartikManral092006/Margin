import type { Redis } from "ioredis";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { HeatBucket, Heatmap } from "@/features/heatmap/shared/heatmap";

// Postgres is the truth; Redis keeps a version per lecture (bumped after every change) and the
// counts read at that version. Viewers' live streams watch the version, so a change reaches
// everyone within one stream tick. A reader that raced a change can cache counts under the old
// version, but a cached entry is only used while its version is current, so it is never served.
const versionKey = (lectureId: string) => `hm:v:${lectureId}`;
const cacheKey = (lectureId: string) => `hm:c:${lectureId}`;
const CACHE_TTL_SECONDS = 600;
const VERSION_TTL_SECONDS = 30 * 24 * 3600;

async function countBuckets(db: PrismaClient, lectureId: string): Promise<HeatBucket[]> {
  const rows = await db.lostReaction.groupBy({
    by: ["bucket"],
    where: { lectureId },
    _count: { _all: true },
    orderBy: { bucket: "asc" },
  });
  return rows.map((row) => ({ bucket: row.bucket, count: row._count._all }));
}

// The new version, or null if Redis didn't take it.
async function bump(redis: Redis, lectureId: string): Promise<number | null> {
  const results = await redis
    .multi()
    .incr(versionKey(lectureId))
    .expire(versionKey(lectureId), VERSION_TTL_SECONDS)
    .del(cacheKey(lectureId))
    .exec();
  const [error, version] = results?.[0] ?? [null, null];
  return !error && typeof version === "number" ? version : null;
}

// For deletions that bypass setLost (an account removed with its reactions): the cached counts
// are dropped and live viewers re-read.
export async function invalidateHeatmap(redis: Redis, lectureId: string): Promise<void> {
  await bump(redis, lectureId);
}

export async function heatmapVersion(redis: Redis, lectureId: string): Promise<number> {
  return Number((await redis.get(versionKey(lectureId))) ?? 0);
}

// All counts (the routes show others only publicHeatmap), from the cache when it matches the
// current version, unless `fresh`. Without Redis it still answers from Postgres (version 0).
export async function readHeatmap(
  db: PrismaClient,
  redis: Redis,
  lectureId: string,
  options: { fresh?: boolean } = {},
): Promise<Heatmap> {
  let version: number | null = null;
  try {
    const [cached, current] = await redis.mget(cacheKey(lectureId), versionKey(lectureId));
    version = Number(current ?? 0);
    if (cached && !options.fresh) {
      const parsed = JSON.parse(cached) as Heatmap;
      if (parsed.version === version) return parsed;
    }
  } catch {
    version = null;
  }
  const heatmap = { version: version ?? 0, buckets: await countBuckets(db, lectureId) };
  if (version !== null) {
    await redis
      .set(cacheKey(lectureId), JSON.stringify(heatmap), "EX", CACHE_TTL_SECONDS)
      .catch(() => undefined);
  }
  return heatmap;
}

export async function myLostBuckets(
  db: PrismaClient,
  lectureId: string,
  userId: string,
): Promise<number[]> {
  const rows = await db.lostReaction.findMany({
    where: { lectureId, userId },
    select: { bucket: true },
    orderBy: { bucket: "asc" },
  });
  return rows.map((row) => row.bucket);
}

// Idempotent: marking the same bucket twice, or removing a missing mark, changes nothing.
// `version` is the heatmap version that includes the change (null: none, or Redis is down).
export async function setLost(
  db: PrismaClient,
  redis: Redis,
  input: { lectureId: string; userId: string; bucket: number; lost: boolean },
): Promise<{ changed: boolean; version: number | null }> {
  const where = { lectureId: input.lectureId, userId: input.userId, bucket: input.bucket };
  const { count } = input.lost
    ? await db.lostReaction.createMany({ data: [where], skipDuplicates: true })
    : await db.lostReaction.deleteMany({ where });
  if (count === 0) return { changed: false, version: null };
  // Postgres has it. If Redis misses the bump, the version doesn't move: live streams pick the
  // change up on their periodic fresh read (and rewrite the cache), within a minute.
  const version = await bump(redis, input.lectureId).catch(() => null);
  return { changed: true, version };
}
