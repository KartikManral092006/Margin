import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findOrCreatePublicLecture } from "@/features/lectures/server/lectures";
import {
  endOtherHostedParties,
  endParty,
  getActiveParty,
  startParty,
} from "@/features/party/server/parties";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { newAlnumId } from "@/lib/ids";
import { NEXCONN_ID_RE } from "@/features/nexconn/shared/ids";

const url = process.env.TEST_DATABASE_URL;
const safe = Boolean(url) && (process.env.CI === "true" || /\/[^/?]+_test(\?|$)/.test(url ?? ""));
const EMAIL_DOMAIN = "@parties.int.test";
const YT_PREFIX = "ptest";

describe.skipIf(!safe)("watch parties (Postgres)", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  let users: string[] = [];
  let lectureId = "";

  async function cleanup() {
    await db.lecture.deleteMany({ where: { youtubeId: { startsWith: YT_PREFIX } } });
    await db.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  }

  beforeAll(async () => {
    await cleanup();
    users = Array.from({ length: 10 }, () => newAlnumId());
    await db.user.createMany({
      data: users.map((id, i) => ({
        id,
        nexconnUserId: id,
        name: `p${i}`,
        email: `${id}${EMAIL_DOMAIN}`,
      })),
    });
    const { lecture } = await findOrCreatePublicLecture(db, {
      youtubeId: `${YT_PREFIX}Main01`,
      meta: { title: "Parties", channelName: "Integration" },
      userId: users[0]!,
      newId: () => newAlnumId(),
    });
    lectureId = lecture.id;
  });

  afterAll(async () => {
    await cleanup();
    await db.$disconnect();
  });

  it("starts exactly one party when 10 people start one at the same moment", async () => {
    const results = await Promise.all(
      users.map((hostId) => startParty(db, { lectureId, hostId, id: newAlnumId() })),
    );
    expect(new Set(results.map((r) => r.party.id)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await db.watchParty.count({ where: { lectureId, endedAt: null } })).toBe(1);
    const party = results[0]!.party;
    expect(party.nexconnOpenChannelId).toBe(`pty${party.id}`);
    expect(party.nexconnOpenChannelId).toMatch(NEXCONN_ID_RE);
  });

  it("ends once, and then a new party can start", async () => {
    const active = await getActiveParty(db, lectureId);
    if (!active) throw new Error("no active party");
    const ended = await Promise.all([1, 2, 3].map(() => endParty(db, active.id, new Date())));
    expect(ended.filter(Boolean)).toHaveLength(1);
    expect(await getActiveParty(db, lectureId)).toBeNull();

    const next = await startParty(db, { lectureId, hostId: users[3]!, id: newAlnumId() });
    expect(next.created).toBe(true);
    expect(next.party.id).not.toBe(active.id);
    expect(next.party.host.name).toBe("p3");
  });

  it("ends a host's party elsewhere when they start a new one", async () => {
    const host = users[5]!;
    const { lecture: other } = await findOrCreatePublicLecture(db, {
      youtubeId: `${YT_PREFIX}Other1`,
      meta: { title: "Other", channelName: "Integration" },
      userId: host,
      newId: () => newAlnumId(),
    });
    const first = await startParty(db, { lectureId: other.id, hostId: host, id: newAlnumId() });
    const before = await getActiveParty(db, lectureId);
    if (before) await endParty(db, before.id, new Date());
    const second = await startParty(db, { lectureId, hostId: host, id: newAlnumId() });

    const ended = await endOtherHostedParties(db, {
      hostId: host,
      keepId: second.party.id,
      at: new Date(),
    });
    expect(ended.map((p) => p.id)).toEqual([first.party.id]);
    expect(await getActiveParty(db, other.id)).toBeNull();
    expect((await getActiveParty(db, lectureId))?.id).toBe(second.party.id);
    // Nothing left to end the second time.
    expect(
      await endOtherHostedParties(db, { hostId: host, keepId: second.party.id, at: new Date() }),
    ).toEqual([]);
  });
});
