import "server-only";
import { fetchYouTubeMeta, type MetaResult } from "@/features/lectures/server/oembed";
import type { OpenDeps } from "@/features/lectures/server/open";
import type { RoomChatDeps } from "@/features/lectures/server/room-chat";
import { getNexconn } from "@/features/nexconn/server";
import { getChatToken } from "@/features/nexconn/server/tokens";
import { db } from "@/lib/db";
import { newAlnumId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { consumeRate, consumeRateStrict } from "@/lib/rate-limit.server";
import { redis } from "@/lib/redis";

const META_TTL_SECONDS = 86_400;
const META_MISS_TTL_SECONDS = 600;
const GROUP_CREATES_PER_DAY = { window: 86_400, max: 200 };
const GROUP_CREATES_PER_USER = { window: 86_400, max: 5 };
const GROUP_LOCK_SECONDS = 30;
// Shared cap on real oEmbed calls (cache misses) from every path, so no route can flood YouTube.
const OEMBED_CALLS = { window: 60, max: 120 };

function metaKey(videoId: string): string {
  return `yt:meta:v1:${videoId}`;
}

// Cached so the preview on /lectures/new and the create action share one oEmbed call.
// Redis problems skip the cache instead of failing the request.
export async function getVideoMeta(videoId: string): Promise<MetaResult> {
  try {
    const cached = await redis.get(metaKey(videoId));
    if (cached) return JSON.parse(cached) as MetaResult;
  } catch (error) {
    logger.warn({ err: error }, "video meta cache read failed");
  }

  if (!(await consumeRate("yt:oembed:all", OEMBED_CALLS)).allowed) {
    return { ok: false, error: "youtube_unavailable" };
  }
  const result = await fetchYouTubeMeta(videoId);
  if (result.ok || result.error !== "youtube_unavailable") {
    try {
      const ttl = result.ok ? META_TTL_SECONDS : META_MISS_TTL_SECONDS;
      await redis.set(metaKey(videoId), JSON.stringify(result), "EX", ttl);
    } catch (error) {
      logger.warn({ err: error }, "video meta cache write failed");
    }
  }
  return result;
}

export function openDeps(): OpenDeps {
  return { db, getMeta: getVideoMeta, consumeRate, newId: () => newAlnumId() };
}

export function roomChatDeps(): RoomChatDeps {
  return {
    db,
    client: getNexconn(),
    registerUser: getChatToken,
    allowGroupCreate: async (userId) =>
      (await consumeRateStrict(`nx:group:create:u:${userId}`, GROUP_CREATES_PER_USER)).allowed &&
      (await consumeRateStrict("nx:group:create", GROUP_CREATES_PER_DAY)).allowed,
    acquireGroupLock: async (lectureId) => {
      try {
        const result = await redis.set(
          `nx:group:lock:${lectureId}`,
          "1",
          "EX",
          GROUP_LOCK_SECONDS,
          "NX",
        );
        return result === "OK";
      } catch (error) {
        logger.warn({ err: error }, "group lock unavailable");
        return false;
      }
    },
    releaseGroupLock: async (lectureId) => {
      await redis.del(`nx:group:lock:${lectureId}`).catch(() => 0);
    },
  };
}
