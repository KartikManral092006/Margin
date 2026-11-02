import { Redis } from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import { leavePresence, readPresence, recordHeartbeat } from "@/features/presence/server/presence";
import { buildSnapshot, PRESENCE_TTL_MS } from "@/features/presence/shared/presence";
import { newAlnumId } from "@/lib/ids";

const url = process.env.TEST_REDIS_URL;

describe.skipIf(!url)("presence (Redis)", () => {
  const redis = new Redis(url ?? "redis://localhost:6379");
  const lectureId = `itest${newAlnumId(16)}`;

  afterAll(async () => {
    await redis.del(`pr:${lectureId}:seen`, `pr:${lectureId}:pos`);
    redis.disconnect();
  });

  it("records heartbeats, drops viewers after 45 s, and removes a viewer who leaves", async () => {
    const now = Date.now();
    await recordHeartbeat(
      redis,
      lectureId,
      { userId: "a", name: "Ana", tSec: 10, playing: true },
      now,
    );
    await recordHeartbeat(
      redis,
      lectureId,
      { userId: "b", name: "Ravi", tSec: 20, playing: false },
      now,
    );
    await recordHeartbeat(
      redis,
      lectureId,
      { userId: "old", name: "Gone", tSec: 15, playing: true },
      now - PRESENCE_TTL_MS - 1000,
    );

    const entries = await readPresence(redis, lectureId, now);
    expect(entries.map((e) => e.userId).sort()).toEqual(["a", "b"]);
    expect(await redis.hexists(`pr:${lectureId}:pos`, "old")).toBe(0); // pruned

    // A moving viewer is counted once, at the new position.
    await recordHeartbeat(
      redis,
      lectureId,
      { userId: "a", name: "Ana", tSec: 95, playing: true },
      now + 1,
    );
    const snapshot = buildSnapshot(await readPresence(redis, lectureId, now + 2), "b");
    expect(snapshot).toEqual({ windows: { "3": { count: 1, names: ["Ana"] } }, total: 1 });

    await leavePresence(redis, lectureId, "a");
    expect((await readPresence(redis, lectureId, now + 3)).map((e) => e.userId)).toEqual(["b"]);
    expect(await redis.ttl(`pr:${lectureId}:seen`)).toBeGreaterThan(0); // keys expire if idle
  });
});
