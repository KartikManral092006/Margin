import { describe, expect, it, vi } from "vitest";
import { ensureRoomChat, type RoomChatDeps } from "@/features/lectures/server/room-chat";
import { NexconnApiError, type NexconnClient } from "@/features/nexconn/server/client";
import type { Lecture, PrismaClient } from "@/lib/generated/prisma/client";

const lecture = {
  id: "L".repeat(32),
  youtubeId: "jNQXAC9IVRw",
  nexconnChannelId: `lec${"L".repeat(32)}`,
  nexconnGroupReadyAt: null,
} as Lecture;
const user = { id: "U".repeat(32), nexconnUserId: "U".repeat(32), name: "Student" };

const apiError = (code: number) => new NexconnApiError("/v4/x", 200, code, "r", "failed");

// In-memory stand-in for the few Prisma calls ensureRoomChat makes.
function fakeDb(initial: { nexconnJoinedAt?: Date | null } = {}) {
  const state = {
    member: false,
    nexconnJoinedAt: initial.nexconnJoinedAt ?? null,
    groupReady: false,
  };
  const tx = {
    lectureMembership: {
      createMany: vi.fn(async () => {
        const created = !state.member;
        state.member = true;
        return { count: created ? 1 : 0 };
      }),
      findUniqueOrThrow: vi.fn(async () => ({
        role: "member",
        nexconnJoinedAt: state.nexconnJoinedAt,
      })),
      update: vi.fn(async ({ data }: { data: { nexconnJoinedAt: Date } }) => {
        state.nexconnJoinedAt = data.nexconnJoinedAt;
        return {};
      }),
    },
    lecture: {
      findUnique: vi.fn(async () => ({
        nexconnGroupReadyAt: state.groupReady ? new Date() : null,
      })),
      update: vi.fn(async () => ({ memberCount: 1 })),
      findUniqueOrThrow: vi.fn(async () => ({ memberCount: 1 })),
      updateMany: vi.fn(async () => {
        state.groupReady = true;
        return { count: 1 };
      }),
    },
  };
  const db = { ...tx, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
  return { db: db as unknown as PrismaClient, state, tx };
}

function setup(
  respond: (path: string) => unknown,
  options: { nexconnJoinedAt?: Date | null; allowCreate?: boolean; lockFree?: boolean } = {},
) {
  const { db, state } = fakeDb(options);
  const order: string[] = [];
  const call = vi.fn(async (path: string) => {
    order.push(path);
    return respond(path);
  });
  const client = { call, currentHost: () => "h" } as unknown as NexconnClient;
  const deps: RoomChatDeps = {
    db,
    client,
    registerUser: vi.fn(async ({ userId }: { userId: string }) => {
      order.push(`token:${userId}`);
    }),
    allowGroupCreate: vi.fn(async () => options.allowCreate ?? true),
    acquireGroupLock: vi.fn(async () => options.lockFree ?? true),
    releaseGroupLock: vi.fn(async () => {}),
  };
  return { deps, order, state, call };
}

describe("ensureRoomChat", () => {
  it("registers the user, creates the group, then joins", async () => {
    const { deps, order, state } = setup(() => ({}));
    await expect(ensureRoomChat(deps, lecture, user)).resolves.toEqual({
      chat: "ok",
      channelId: lecture.nexconnChannelId,
    });
    expect(order).toEqual([
      `token:${user.nexconnUserId}`,
      "token:marginbot",
      "/v4/group-channel/create",
      "/v4/group-channel/join",
    ]);
    expect(state.groupReady).toBe(true);
    expect(state.nexconnJoinedAt).toBeInstanceOf(Date);
  });

  it("treats 'group exists' and 'already a member' as success", async () => {
    const { deps } = setup((path) => {
      throw apiError(path.endsWith("create") ? 25409 : 25412);
    });
    await expect(ensureRoomChat(deps, lecture, user)).resolves.toMatchObject({ chat: "ok" });
  });

  it("skips Nexconn entirely once the user has joined", async () => {
    const { deps, call } = setup(() => ({}), { nexconnJoinedAt: new Date() });
    await expect(ensureRoomChat(deps, lecture, user)).resolves.toMatchObject({ chat: "ok" });
    expect(call).not.toHaveBeenCalled();
    expect(deps.registerUser).not.toHaveBeenCalled();
  });

  it("recreates a missing group once, then joins", async () => {
    let joins = 0;
    const ready = { ...lecture, nexconnGroupReadyAt: new Date() };
    const { deps, order } = setup((path) => {
      if (path.endsWith("join") && joins++ === 0) throw apiError(25410);
      return {};
    });
    await expect(ensureRoomChat(deps, ready, user)).resolves.toMatchObject({ chat: "ok" });
    expect(order.filter((p) => p.endsWith("create"))).toHaveLength(1);
    expect(order.filter((p) => p.endsWith("join"))).toHaveLength(2);
  });

  it("reports a full group without failing", async () => {
    const { deps, state } = setup((path) => {
      if (path.endsWith("join")) throw apiError(25411);
      return {};
    });
    await expect(ensureRoomChat(deps, lecture, user)).resolves.toEqual({ chat: "full" });
    expect(state.nexconnJoinedAt).toBeNull();
  });

  it("does not create a group when the daily group budget is spent", async () => {
    const { deps, call } = setup(() => ({}), { allowCreate: false });
    await expect(ensureRoomChat(deps, lecture, user)).rejects.toMatchObject({
      name: "ChatUnavailableError",
      reason: "group_quota",
    });
    expect(call).not.toHaveBeenCalled();
  });

  it("charges the creating user's group budget and releases the room lock", async () => {
    const { deps } = setup(() => ({}));
    await ensureRoomChat(deps, lecture, user);
    expect(deps.allowGroupCreate).toHaveBeenCalledWith(user.id);
    expect(deps.acquireGroupLock).toHaveBeenCalledWith(lecture.id);
    expect(deps.releaseGroupLock).toHaveBeenCalledWith(lecture.id);
  });

  it("answers busy, without spending quota, while another request creates the group", async () => {
    const { deps, call } = setup(() => ({}), { lockFree: false });
    deps.sleep = vi.fn(async () => {});
    await expect(ensureRoomChat(deps, lecture, user)).rejects.toMatchObject({ reason: "busy" });
    expect(deps.allowGroupCreate).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });

  it("skips creating when another request recorded the group meanwhile", async () => {
    const { deps, order, state } = setup(() => ({}));
    state.groupReady = true; // the row says the group exists, the passed lecture is stale
    await expect(ensureRoomChat(deps, lecture, user)).resolves.toMatchObject({ chat: "ok" });
    expect(order).not.toContain("/v4/group-channel/create");
    expect(deps.allowGroupCreate).not.toHaveBeenCalled();
  });

  it("releases the lock when the budget is spent", async () => {
    const { deps } = setup(() => ({}), { allowCreate: false });
    await expect(ensureRoomChat(deps, lecture, user)).rejects.toMatchObject({
      reason: "group_quota",
    });
    expect(deps.releaseGroupLock).toHaveBeenCalledWith(lecture.id);
  });

  it("passes other Nexconn errors up and records nothing", async () => {
    const { deps, state } = setup((path) => {
      if (path.endsWith("join")) throw apiError(1008);
      return {};
    });
    await expect(ensureRoomChat(deps, lecture, user)).rejects.toBeInstanceOf(NexconnApiError);
    expect(state.nexconnJoinedAt).toBeNull();
  });
});

describe("ensureRoomChat when two people open a new room together", () => {
  it("waits for the other request to create the group, then joins without creating", async () => {
    const { deps, order, state } = setup(() => ({}), { lockFree: false });
    let checks = 0;
    deps.sleep = vi.fn(async () => {
      if (++checks === 2) state.groupReady = true; // the other request finished
    });
    await expect(ensureRoomChat(deps, lecture, user)).resolves.toMatchObject({ chat: "ok" });
    expect(order).not.toContain("/v4/group-channel/create");
    expect(order).toContain("/v4/group-channel/join");
    expect(deps.allowGroupCreate).not.toHaveBeenCalled();
  });

  it("answers busy only after waiting, if the group still doesn't exist", async () => {
    const { deps } = setup(() => ({}), { lockFree: false });
    deps.sleep = vi.fn(async () => {});
    await expect(ensureRoomChat(deps, lecture, user)).rejects.toMatchObject({ reason: "busy" });
    expect(deps.sleep).toHaveBeenCalled();
  });
});
