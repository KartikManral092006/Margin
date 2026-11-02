import type { Redis } from "ioredis";
import { PRESENCE_TTL_MS, type PresenceEntry } from "@/features/presence/shared/presence";

// Per room: a sorted set of viewer ids scored by last heartbeat, and a hash with each viewer's
// position. Both expire if the room goes quiet.
const KEY_TTL_SECONDS = 120;
const MAX_VIEWERS = 1000;

const seenKey = (lectureId: string) => `pr:${lectureId}:seen`;
const posKey = (lectureId: string) => `pr:${lectureId}:pos`;

type StoredPosition = { name: string; tSec: number; playing: boolean };

export async function recordHeartbeat(
  redis: Redis,
  lectureId: string,
  entry: PresenceEntry,
  now: number,
): Promise<void> {
  const position: StoredPosition = { name: entry.name, tSec: entry.tSec, playing: entry.playing };
  await redis
    .multi()
    .zadd(seenKey(lectureId), now, entry.userId)
    .hset(posKey(lectureId), entry.userId, JSON.stringify(position))
    .expire(seenKey(lectureId), KEY_TTL_SECONDS)
    .expire(posKey(lectureId), KEY_TTL_SECONDS)
    .exec();
}

export async function leavePresence(redis: Redis, lectureId: string, userId: string) {
  await redis.multi().zrem(seenKey(lectureId), userId).hdel(posKey(lectureId), userId).exec();
}

// Drops viewers whose last heartbeat is older than the TTL, then returns everyone else.
export async function readPresence(
  redis: Redis,
  lectureId: string,
  now: number,
): Promise<PresenceEntry[]> {
  const cutoff = now - PRESENCE_TTL_MS;
  const stale = await redis.zrangebyscore(seenKey(lectureId), "-inf", `(${cutoff}`);
  if (stale.length > 0) {
    await redis
      .multi()
      .zremrangebyscore(seenKey(lectureId), "-inf", `(${cutoff}`)
      .hdel(posKey(lectureId), ...stale)
      .exec();
  }

  const ids = await redis.zrevrange(seenKey(lectureId), 0, MAX_VIEWERS - 1);
  if (ids.length === 0) return [];
  const positions = await redis.hmget(posKey(lectureId), ...ids);

  const entries: PresenceEntry[] = [];
  ids.forEach((userId, i) => {
    const raw = positions[i];
    if (!raw) return;
    try {
      const position = JSON.parse(raw) as StoredPosition;
      entries.push({ userId, ...position });
    } catch {
      // A corrupt entry is skipped; the next heartbeat rewrites it.
    }
  });
  return entries;
}
