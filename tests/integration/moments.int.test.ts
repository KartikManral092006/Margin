import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findOrCreatePublicLecture } from "@/features/lectures/server/lectures";
import {
  createMoment,
  listMomentsInWindow,
  momentsToResend,
  recordSendResult,
} from "@/features/moments/server/moments";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { newAlnumId } from "@/lib/ids";

const url = process.env.TEST_DATABASE_URL;
const safe = Boolean(url) && (process.env.CI === "true" || /\/[^/?]+_test(\?|$)/.test(url ?? ""));

const EMAIL_DOMAIN = "@moments.int.test";
const YT_PREFIX = "mtest";
const meta = { title: "Moments video", channelName: "Integration" };

describe.skipIf(!safe)("moments (Postgres)", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  let userId = "";
  let otherUserId = "";
  let lectureId = "";
  let otherLectureId = "";

  async function cleanup() {
    await db.lecture.deleteMany({ where: { youtubeId: { startsWith: YT_PREFIX } } });
    await db.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  }

  beforeAll(async () => {
    await cleanup();
    const ids = [newAlnumId(), newAlnumId()];
    await db.user.createMany({
      data: ids.map((id, i) => ({
        id,
        nexconnUserId: id,
        name: `m${i}`,
        email: `${id}${EMAIL_DOMAIN}`,
      })),
    });
    [userId, otherUserId] = ids as [string, string];
    const make = async (suffix: string) =>
      (
        await findOrCreatePublicLecture(db, {
          youtubeId: `${YT_PREFIX}${suffix}`,
          meta,
          userId,
          newId: () => newAlnumId(),
        })
      ).lecture.id;
    lectureId = await make("Main01");
    otherLectureId = await make("Othr01");
  });

  afterAll(async () => {
    await cleanup();
    await db.$disconnect();
  });

  const post = (overrides: Record<string, unknown> = {}) =>
    createMoment(db, {
      clientId: "cIdem00001",
      tSec: 61.9,
      body: "Why?",
      lectureId,
      userId,
      id: newAlnumId(),
      ...overrides,
    } as Parameters<typeof createMoment>[1]);

  it("creates one moment when the same doubt is posted 10 times at once", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => post()));
    const ids = new Set(results.map((r) => (r.ok ? r.moment.id : "error")));
    expect(ids.size).toBe(1);
    expect(results.filter((r) => r.ok && r.created)).toHaveLength(1);
    expect(await db.moment.count({ where: { userId, clientId: "cIdem00001" } })).toBe(1);
    const first = results[0];
    expect(first?.ok && first.moment.tSec).toBe(61); // whole seconds
  });

  it("lets two users reuse the same clientId", async () => {
    const a = await post({ clientId: "cShared001" });
    const b = await post({ clientId: "cShared001", userId: otherUserId });
    expect(a.ok && b.ok && a.moment.id !== b.moment.id).toBe(true);
  });

  it("accepts a reply in the same lecture and rejects other parents", async () => {
    const parent = await post({ clientId: "cParent001" });
    if (!parent.ok) throw new Error("parent");
    const reply = await post({ clientId: "cReply0001", parentId: parent.moment.id });
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;

    expect(await post({ clientId: "cNested001", parentId: reply.moment.id })).toEqual({
      ok: false,
      error: "parent_not_found",
    });
    expect(
      await post({ clientId: "cOther0001", parentId: parent.moment.id, lectureId: otherLectureId }),
    ).toEqual({ ok: false, error: "parent_not_found" });
  });

  it("lists a window in order and nothing outside it", async () => {
    for (const [clientId, tSec] of [
      ["cWin000001", 400],
      ["cWin000002", 100],
      ["cWin000003", 950],
    ] as const) {
      await post({ clientId, tSec });
    }
    const rows = await listMomentsInWindow(db, lectureId, 90, 900, userId);
    const secs = rows.map((r) => r.tSec);
    expect(secs).toEqual([...secs].sort((x, y) => x - y));
    expect(secs).toContain(100);
    expect(secs).toContain(400);
    expect(secs).not.toContain(950);
    expect(rows.every((r) => r.lectureId === lectureId)).toBe(true);
    expect(rows[0]?.user?.name).toBeDefined();
  });

  it("offers failed moments at once, pending ones only when old, and stops after 3 attempts", async () => {
    const result = await post({ clientId: "cResend001" });
    if (!result.ok) throw new Error("post");
    const now = new Date();
    const later = new Date(Date.now() + 60_000);
    const ids = async (at: Date) =>
      (await momentsToResend(db, lectureId, at, 100)).map((m) => m.id);

    expect(await ids(now)).not.toContain(result.moment.id); // fresh pending: send may be in flight
    expect(await ids(later)).toContain(result.moment.id);

    // Skipped because the room had no group yet: eligible at once, no attempt used.
    await recordSendResult(db, result.moment.id, { ok: false, attempted: false });
    expect(await ids(now)).toContain(result.moment.id);
    expect(
      (await db.moment.findUniqueOrThrow({ where: { id: result.moment.id } })).sendAttempts,
    ).toBe(0);

    for (let i = 0; i < 3; i++) {
      await recordSendResult(db, result.moment.id, { ok: false, attempted: true });
    }
    expect((await momentsToResend(db, lectureId, later, 100)).map((m) => m.id)).not.toContain(
      result.moment.id,
    );
    await recordSendResult(db, result.moment.id, { ok: true, messageId: "nx" });
    const row = await db.moment.findUniqueOrThrow({ where: { id: result.moment.id } });
    expect(row).toMatchObject({ sendStatus: "sent", nexconnMessageId: "nx" });
  });
});
