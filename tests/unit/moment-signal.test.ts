import { describe, expect, it, vi } from "vitest";
import type { MomentRow } from "@/features/moments/server/moments";
import { toMomentView } from "@/features/moments/server/moments";
import { roomMomentPayload, sendMomentSignal } from "@/features/moments/server/signal";
import { momentFromSignal } from "@/features/moments/shared/signal";
import type { NexconnClient } from "@/features/nexconn/server/client";
import { decodeContent, momentSchema, roomMomentSchema } from "@/features/nexconn/shared/messages";

const row = {
  id: "M".repeat(32),
  lectureId: "L".repeat(32),
  userId: "U".repeat(32),
  clientId: "c12345678",
  tSec: 75,
  body: "Why O(n)?",
  parentId: null,
  status: "open",
  upvotes: 2,
  pinnedAt: null,
  pinnedById: null,
  nexconnMessageId: null,
  sendStatus: "pending",
  sendAttempts: 0,
  createdAt: new Date("2026-11-02T10:00:00.000Z"),
  updatedAt: new Date("2026-11-02T10:00:00.000Z"),
  user: { name: "Kartik", nexconnUserId: "U".repeat(32) },
} as MomentRow;

describe("sendMomentSignal", () => {
  it("sends MG:Moment to the room's group as marginbot, carrying the whole doubt", async () => {
    const order: string[] = [];
    const call = vi.fn(async (path: string) => {
      order.push(path);
      return { messageIds: [{ channelId: "lecX", messageId: "nx1" }] };
    });
    const registerUser = vi.fn(async ({ userId }: { userId: string }) => {
      order.push(`token:${userId}`);
    });
    const result = await sendMomentSignal(
      { client: { call, currentHost: () => "h" } as unknown as NexconnClient, registerUser },
      { nexconnChannelId: "lecX" },
      row,
      "Kartik",
    );

    expect(result).toEqual({ messageId: "nx1" });
    expect(order).toEqual(["token:marginbot", "/v4/group-channel/message/send"]);
    const [, body, options] = call.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
      { retryOnFailover: boolean },
    ];
    expect(body).toMatchObject({
      fromUserId: "marginbot",
      toChannelIds: ["lecX"],
      messageType: "MG:Moment",
      hasMetadata: true,
    });
    expect(options).toEqual({ retryOnFailover: false });
    expect(decodeContent(roomMomentSchema, body.content)).toEqual({
      momentId: row.id,
      lectureId: row.lectureId,
      tSec: 75,
      text: "Why O(n)?",
      parentId: null,
      authorName: "Kartik",
      clientId: "c12345678",
      createdAt: "2026-11-02T10:00:00.000Z",
    });
    // Older decoders (the Day 2 lab) still read it.
    expect(decodeContent(momentSchema, body.content)?.momentId).toBe(row.id);
  });
});

describe("momentFromSignal", () => {
  const room = { lectureId: row.lectureId, channelId: "lecX" };
  const content = JSON.stringify(roomMomentPayload(row, "Kartik"));
  const message = {
    channelId: "lecX",
    messageType: "MG:Moment",
    senderUserId: "marginbot",
    content,
  };

  it("turns marginbot's message into a moment for this room", () => {
    expect(momentFromSignal({ ...message, messageId: "nx9" }, room)).toMatchObject({
      nexconnMessageId: "nx9",
      votedByMe: false,
      id: row.id,
      tSec: 75,
      body: "Why O(n)?",
      authorName: "Kartik",
      mine: false,
      clientId: "c12345678",
    });
  });

  it.each([
    ["a student's client (spoofing)", { senderUserId: "U".repeat(32) }],
    ["another room's channel", { channelId: "lecY" }],
    ["another message type", { messageType: "RC:TxtMsg" }],
    ["a payload for another lecture", { content: content.replace(row.lectureId, "Z".repeat(32)) }],
    ["a broken payload", { content: "{nope" }],
    [
      "the old payload without an author",
      {
        content: JSON.stringify({
          momentId: "m",
          lectureId: row.lectureId,
          tSec: 1,
          text: "x",
          parentId: null,
        }),
      },
    ],
  ])("ignores %s", (_label, overrides) => {
    expect(momentFromSignal({ ...message, ...overrides }, room)).toBeNull();
  });
});

describe("toMomentView", () => {
  it("tells the viewer whether they voted", () => {
    expect(toMomentView({ ...row, votes: [{ userId: "v1" }] }, "v1").votedByMe).toBe(true);
    expect(toMomentView({ ...row, votes: [] }, "v1").votedByMe).toBe(false);
    expect(toMomentView(row, "v1").votedByMe).toBe(false);
  });

  it("shows the author's own clientId only to the author", () => {
    expect(toMomentView(row, "U".repeat(32))).toMatchObject({ mine: true, clientId: "c12345678" });
    expect(toMomentView(row, "someone-else")).toMatchObject({ mine: false, clientId: null });
  });

  it("names the author without exposing an email", () => {
    const view = toMomentView({ ...row, user: { name: "", nexconnUserId: "abcdWXYZ" } }, "x");
    expect(view.authorName).toBe("Learner WXYZ");
    expect(JSON.stringify(view)).not.toContain("@");
  });

  it("handles a deleted author", () => {
    expect(toMomentView({ ...row, userId: null, user: null }, "x").authorName).toBe(
      "Former member",
    );
  });
});
