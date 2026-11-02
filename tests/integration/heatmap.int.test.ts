import { PrismaPg } from "@prisma/adapter-pg";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  heatmapVersion,
  myLostBuckets,
  readHeatmap,
  setLost,
} from "@/features/heatmap/server/heatmap";
import { findOrCreatePublicLecture } from "@/features/lectures/server/lectures";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { newAlnumId } from "@/lib/ids";

const url = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
const safe =
  Boolean(url) &&
  Boolean(redisUrl) &&
  (process.env.CI === "true" || /\/[^/?]+_test(\?|$)/.test(url ?? ""));

const EMAIL_DOMAIN = "@heatmap.int.test";
const YT_PREFIX = "htest";

describe.skipIf(!safe)("heatmap (Postgres + Redis)", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const redis = new Redis(redisUrl ?? "redis://localhost:6379");
  let users: string[] = [];
  let lectureId = "";

  async function cleanup() {
    const lectures = await db.lecture.findMany({
      where: { youtubeId: { startsWith: YT_PREFIX } },
      select: { id: true },
    });
    for (const { id } of lectures) await redis.del(`hm:v:${id}`, `hm:c:${id}`);
    await db.lecture.deleteMany({ where: { youtubeId: { startsWith: YT_PREFIX } } });
    await db.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  }

  beforeAll(async () => {
    await cleanup();
    users = Array.from({ length: 4 }, () => newAlnumId());
    await db.user.createMany({
      data: users.map((id, i) => ({
        id,
        nexconnUserId: id,
        name: `h${i}`,
        email: `${id}${EMAIL_DOMAIN}`,
      })),
    });
    const { lecture } = await findOrCreatePublicLecture(db, {
      youtubeId: `${YT_PREFIX}Main01`,
      meta: { title: "Heatmap", channelName: "Integration" },
      userId: users[0]!,
      newId: () => newAlnumId(),
    });
    lectureId = lecture.id;
  });

  afterAll(async () => {
    await cleanup();
    await db.$disconnect();
    redis.disconnect();
  });

  const mark = (user: number, bucket: number, lost = true) =>
    setLost(db, redis, { lectureId, userId: users[user]!, bucket, lost });

  it("counts people per bucket, once each, and bumps the version only on a change", async () => {
    const first = await mark(0, 10);
    expect(first.changed).toBe(true);
    expect(first.version).toBe(1);
    // Twice at once from the same person: one row, one bump.
    const again = await Promise.all([mark(0, 10), mark(0, 10)]);
    expect(again.every((r) => !r.changed && r.version === null)).toBe(true);
    await mark(1, 10);
    await mark(1, 11);
    expect(await heatmapVersion(redis, lectureId)).toBe(3);
    expect(await readHeatmap(db, redis, lectureId)).toEqual({
      version: 3,
      buckets: [
        { bucket: 10, count: 2 },
        { bucket: 11, count: 1 },
      ],
    });
    expect(await myLostBuckets(db, lectureId, users[1]!)).toEqual([10, 11]);
  });

  it("serves the cache until the next change, then the new counts", async () => {
    const cached = await redis.get(`hm:c:${lectureId}`);
    expect(JSON.parse(cached ?? "null")).toMatchObject({ version: 3 });
    const removed = await mark(1, 11, false);
    expect(removed).toEqual({ changed: true, version: 4 });
    expect(await redis.get(`hm:c:${lectureId}`)).toBeNull();
    expect((await readHeatmap(db, redis, lectureId)).buckets).toEqual([{ bucket: 10, count: 2 }]);
    expect(await mark(1, 11, false)).toEqual({ changed: false, version: null });
  });

  it("never serves counts that a concurrent change made stale", async () => {
    // A change empties the cache (version 5); a reader then counts, and another change lands
    // (version 6) before it writes the cache.
    await mark(2, 21);
    const racing = {
      lostReaction: {
        groupBy: async (args: Parameters<typeof db.lostReaction.groupBy>[0]) => {
          const rows = await db.lostReaction.groupBy(args as never);
          await mark(2, 20);
          return rows;
        },
      },
    } as unknown as PrismaClient;
    const stale = await readHeatmap(racing, redis, lectureId);
    expect(stale.buckets).not.toContainEqual({ bucket: 20, count: 1 });
    // The next reader must see the change, not the stale counts.
    const fresh = await readHeatmap(db, redis, lectureId);
    expect(await redis.get(`hm:c:${lectureId}`)).toBe(JSON.stringify(fresh));
    expect(fresh.version).toBe(6);
    expect(fresh.buckets).toContainEqual({ bucket: 20, count: 1 });
  });

  it("heals a change whose version bump was lost, with a fresh read", async () => {
    const cachedBefore = await readHeatmap(db, redis, lectureId); // now cached
    // A write that reached Postgres while Redis missed the bump.
    await db.lostReaction.create({ data: { lectureId, userId: users[3]!, bucket: 25 } });
    expect(await readHeatmap(db, redis, lectureId)).toEqual(cachedBefore);
    const fresh = await readHeatmap(db, redis, lectureId, { fresh: true });
    expect(fresh.buckets).toContainEqual({ bucket: 25, count: 1 });
    // The fresh read rewrote the cache: plain reads see it too now.
    expect(await readHeatmap(db, redis, lectureId)).toEqual(fresh);
    await db.lostReaction.delete({
      where: { lectureId_userId_bucket: { lectureId, userId: users[3]!, bucket: 25 } },
    });
    await readHeatmap(db, redis, lectureId, { fresh: true });
  });

  it("still answers from Postgres when Redis is down", async () => {
    const down = new Redis("redis://localhost:1", {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    const heatmap = await readHeatmap(db, down, lectureId);
    expect(heatmap.version).toBe(0);
    expect(heatmap.buckets).toContainEqual({ bucket: 10, count: 2 });
    const changed = await setLost(db, down, {
      lectureId,
      userId: users[3]!,
      bucket: 30,
      lost: true,
    });
    expect(changed).toEqual({ changed: true, version: null });
    down.disconnect();
  });

  it("deletes a person's reactions with their account", async () => {
    await db.user.delete({ where: { id: users[3]! } });
    expect(await myLostBuckets(db, lectureId, users[3]!)).toEqual([]);
  });
});
