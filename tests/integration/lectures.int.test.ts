import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  findOrCreatePublicLecture,
  findPublicByYoutubeId,
  joinLecture,
} from "@/features/lectures/server/lectures";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { newAlnumId } from "@/lib/ids";

const url = process.env.TEST_DATABASE_URL;
// Never point this at a real database: it creates and deletes rows.
const safe = Boolean(url) && (process.env.CI === "true" || /\/[^/?]+_test(\?|$)/.test(url ?? ""));

const EMAIL_DOMAIN = "@int.test";
const YT_PREFIX = "itest";
const meta = { title: "Integration video", channelName: "Integration" };

describe.skipIf(!safe)("lectures (Postgres)", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  async function cleanup() {
    await db.lecture.deleteMany({ where: { youtubeId: { startsWith: YT_PREFIX } } });
    await db.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  }

  async function createUsers(count: number) {
    const users = Array.from({ length: count }, (_, i) => {
      const id = newAlnumId();
      return { id, nexconnUserId: id, name: `u${i}`, email: `${id}${EMAIL_DOMAIN}` };
    });
    await db.user.createMany({ data: users });
    return users;
  }

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await db.$disconnect();
  });

  it("creates exactly one public room when 20 people paste the same video at once", async () => {
    const users = await createUsers(20);
    const youtubeId = `${YT_PREFIX}Race01`; // 11 characters
    const results = await Promise.all(
      users.map((user) =>
        findOrCreatePublicLecture(db, {
          youtubeId,
          meta,
          userId: user.id,
          newId: () => newAlnumId(),
        }),
      ),
    );

    expect(new Set(results.map((r) => r.lecture.id)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await db.lecture.count({ where: { youtubeId, visibility: "public" } })).toBe(1);
    const lectureId = results[0]!.lecture.id;
    expect(await db.lectureMembership.count({ where: { lectureId } })).toBe(1);
  });

  it("keeps memberCount exact under concurrent and repeated joins", async () => {
    const users = await createUsers(6);
    const creator = users[0]!;
    const { lecture } = await findOrCreatePublicLecture(db, {
      youtubeId: `${YT_PREFIX}Join01`,
      meta,
      userId: creator.id,
      newId: () => newAlnumId(),
    });
    const joiners = [...users, users[1]!, users[2]!, users[3]!, users[1]!]; // 10 calls, 6 people
    await Promise.all(joiners.map((user) => joinLecture(db, lecture.id, user.id)));

    const fresh = await db.lecture.findUniqueOrThrow({ where: { id: lecture.id } });
    expect(fresh.memberCount).toBe(6);
    expect(await db.lectureMembership.count({ where: { lectureId: lecture.id } })).toBe(6);
  });

  it("allows private rooms to share a video and never returns them as the public room", async () => {
    const [owner] = await createUsers(1);
    const youtubeId = `${YT_PREFIX}Priv01`;
    for (let i = 0; i < 2; i++) {
      const id = newAlnumId();
      await db.lecture.create({
        data: {
          id,
          youtubeId,
          title: "Private",
          channelName: "x",
          nexconnChannelId: `lec${id}`,
          visibility: "private",
          createdById: owner!.id,
        },
      });
    }
    expect(await findPublicByYoutubeId(db, youtubeId)).toBeNull();
  });
});
