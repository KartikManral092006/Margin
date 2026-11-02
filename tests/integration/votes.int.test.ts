import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findOrCreatePublicLecture } from "@/features/lectures/server/lectures";
import {
  createMoment,
  markerBuckets,
  setResolved,
  setVote,
  toMomentView,
} from "@/features/moments/server/moments";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { newAlnumId } from "@/lib/ids";

const url = process.env.TEST_DATABASE_URL;
const safe = Boolean(url) && (process.env.CI === "true" || /\/[^/?]+_test(\?|$)/.test(url ?? ""));

const EMAIL_DOMAIN = "@votes.int.test";
const YT_PREFIX = "vtest";

describe.skipIf(!safe)("votes, resolve, replies, markers (Postgres)", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  let users: string[] = [];
  let lectureId = "";
  let otherLectureId = "";
  let counter = 0;

  async function cleanup() {
    await db.lecture.deleteMany({ where: { youtubeId: { startsWith: YT_PREFIX } } });
    await db.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  }

  async function lecture(suffix: string) {
    const { lecture } = await findOrCreatePublicLecture(db, {
      youtubeId: `${YT_PREFIX}${suffix}`,
      meta: { title: "Votes", channelName: "Integration" },
      userId: users[0]!,
      newId: () => newAlnumId(),
    });
    return lecture.id;
  }

  async function moment(
    userId: string,
    tSec: number,
    parentId: string | null = null,
    lid = lectureId,
  ) {
    const result = await createMoment(db, {
      clientId: `cVote${String(++counter).padStart(5, "0")}`,
      tSec,
      body: `doubt ${counter}`,
      parentId,
      lectureId: lid,
      userId,
      id: newAlnumId(),
    });
    if (!result.ok) throw new Error(result.error);
    return result.moment;
  }

  beforeAll(async () => {
    await cleanup();
    users = Array.from({ length: 6 }, () => newAlnumId());
    await db.user.createMany({
      data: users.map((id, i) => ({
        id,
        nexconnUserId: id,
        name: `v${i}`,
        email: `${id}${EMAIL_DOMAIN}`,
      })),
    });
    lectureId = await lecture("Main01");
    otherLectureId = await lecture("Othr01");
  });

  afterAll(async () => {
    await cleanup();
    await db.$disconnect();
  });

  it("counts one vote per person, even when someone double-clicks", async () => {
    const m = await moment(users[0]!, 100);
    const voters = [users[1]!, users[1]!, users[1]!, users[2]!, users[3]!, users[3]!];
    await Promise.all(
      voters.map((userId) => setVote(db, { momentId: m.id, lectureId, userId, on: true })),
    );
    const row = await db.moment.findUniqueOrThrow({ where: { id: m.id } });
    expect(row.upvotes).toBe(3);
    expect(await db.vote.count({ where: { momentId: m.id } })).toBe(3);
  });

  it("takes a vote back once, and a missing vote changes nothing", async () => {
    const m = await moment(users[0]!, 110);
    await setVote(db, { momentId: m.id, lectureId, userId: users[1]!, on: true });
    const results = await Promise.all(
      [1, 2, 3].map(() => setVote(db, { momentId: m.id, lectureId, userId: users[1]!, on: false })),
    );
    expect(results.filter((r) => r.ok && r.changed)).toHaveLength(1);
    const again = await setVote(db, { momentId: m.id, lectureId, userId: users[4]!, on: false });
    expect(again.ok && again.changed).toBe(false);
    expect((await db.moment.findUniqueOrThrow({ where: { id: m.id } })).upvotes).toBe(0);
  });

  it("refuses votes on your own doubt and on another lecture's id", async () => {
    const m = await moment(users[0]!, 120);
    expect(await setVote(db, { momentId: m.id, lectureId, userId: users[0]!, on: true })).toEqual({
      ok: false,
      error: "own_moment",
    });
    expect(
      await setVote(db, { momentId: m.id, lectureId: otherLectureId, userId: users[1]!, on: true }),
    ).toEqual({ ok: false, error: "not_found" });
  });

  it("returns the moment with votedByMe for the voter", async () => {
    const m = await moment(users[0]!, 130);
    const result = await setVote(db, { momentId: m.id, lectureId, userId: users[5]!, on: true });
    if (!result.ok) throw new Error("vote");
    expect(toMomentView(result.moment, users[5]!)).toMatchObject({ upvotes: 1, votedByMe: true });
    expect(toMomentView(result.moment, users[0]!).votedByMe).toBe(false);
  });

  it("lets only the asker resolve or reopen a top-level doubt", async () => {
    const m = await moment(users[0]!, 140);
    expect(
      await setResolved(db, { momentId: m.id, lectureId, userId: users[1]!, resolved: true }),
    ).toEqual({
      ok: false,
      error: "not_author",
    });
    const done = await setResolved(db, {
      momentId: m.id,
      lectureId,
      userId: users[0]!,
      resolved: true,
    });
    expect(done.ok && done.changed && done.moment.status).toBe("resolved");
    const same = await setResolved(db, {
      momentId: m.id,
      lectureId,
      userId: users[0]!,
      resolved: true,
    });
    expect(same.ok && same.changed).toBe(false);
    const reopened = await setResolved(db, {
      momentId: m.id,
      lectureId,
      userId: users[0]!,
      resolved: false,
    });
    expect(reopened.ok && reopened.moment.status).toBe("open");

    const reply = await moment(users[1]!, 999, m.id);
    expect(
      await setResolved(db, { momentId: reply.id, lectureId, userId: users[1]!, resolved: true }),
    ).toEqual({
      ok: false,
      error: "is_reply",
    });
  });

  it("puts a reply at its parent's second, whatever time the client sent", async () => {
    const parent = await moment(users[0]!, 150);
    const reply = await moment(users[2]!, 4000, parent.id);
    expect(reply.tSec).toBe(150);
    expect(reply.parentId).toBe(parent.id);
  });

  it("groups top-level doubts into 15-second marker buckets, ignoring replies", async () => {
    const lid = await lecture("Mark01");
    const a = await moment(users[0]!, 1800, null, lid);
    await moment(users[1]!, 1805, null, lid);
    await moment(users[2]!, 1814, null, lid);
    await moment(users[3]!, 1815, null, lid);
    await moment(users[4]!, 30, null, lid);
    await moment(users[5]!, 0, a.id, lid); // reply: not a marker
    expect(await markerBuckets(db, lid)).toEqual([
      { tSec: 30, count: 1 },
      { tSec: 1800, count: 3 },
      { tSec: 1815, count: 1 },
    ]);
  });
});
