import { describe, expect, it, vi } from "vitest";
import {
  createGroup,
  createOpenChannel,
  issueAccessToken,
  joinGroup,
  sendGroupMessage,
  sendGroupStreamChunk,
} from "@/features/nexconn/server/api";
import { NexconnApiError, type NexconnClient } from "@/features/nexconn/server/client";

function clientReturning(impl: (path: string, body: unknown) => unknown) {
  const call = vi.fn(async (path: string, body: unknown) => impl(path, body));
  const client = { call, currentHost: () => "https://primary.test" };
  return client as unknown as NexconnClient & { call: typeof call };
}

const apiError = (code: number) => new NexconnApiError("/v4/x", 200, code, "r", "failed");

describe("issueAccessToken", () => {
  it("posts the body unchanged and allows failover retry", async () => {
    const client = clientReturning(() => ({ userId: "u1", accessToken: "t" }));
    await expect(issueAccessToken(client, { userId: "u1", name: "U" })).resolves.toEqual({
      userId: "u1",
      accessToken: "t",
    });
    expect(client.call).toHaveBeenCalledWith(
      "/v4/auth/access-token/issue",
      { userId: "u1", name: "U" },
      { retryOnFailover: true },
    );
  });
});

describe("createGroup", () => {
  it("maps 25409 (group exists) to created: false", async () => {
    const client = clientReturning(() => {
      throw apiError(25409);
    });
    await expect(createGroup(client, { channelId: "g", name: "G", owner: "o" })).resolves.toEqual({
      created: false,
    });
  });

  it("rethrows other errors", async () => {
    const client = clientReturning(() => {
      throw apiError(25411);
    });
    await expect(createGroup(client, { channelId: "g", name: "G", owner: "o" })).rejects.toThrow();
  });
});

describe("joinGroup", () => {
  it("treats 25412 (already a member) as success", async () => {
    const client = clientReturning(() => {
      throw apiError(25412);
    });
    await expect(joinGroup(client, { channelId: "g", userIds: ["u"] })).resolves.toBeUndefined();
  });
});

describe("createOpenChannel", () => {
  it("maps 23435 (exists) to created: false", async () => {
    const client = clientReturning(() => {
      throw apiError(23435);
    });
    await expect(createOpenChannel(client, { channelId: "p" })).resolves.toEqual({
      created: false,
    });
  });
});

describe("sendGroupMessage", () => {
  const base = { fromUserId: "u", toChannelIds: ["g"], content: "{}" };

  it("rejects reserved or overlong custom types without calling the API", async () => {
    const client = clientReturning(() => ({ messageIds: [] }));
    await expect(sendGroupMessage(client, { ...base, messageType: "NC:Foo" })).rejects.toThrow();
    await expect(
      sendGroupMessage(client, { ...base, messageType: "X".repeat(33) }),
    ).rejects.toThrow();
    expect(client.call).not.toHaveBeenCalled();
  });

  it("never retries sends on failover", async () => {
    const client = clientReturning(() => ({ messageIds: [{ channelId: "g", messageId: "m" }] }));
    await sendGroupMessage(client, { ...base, messageType: "MG:Moment" });
    expect(client.call).toHaveBeenCalledWith(
      "/v4/group-channel/message/send",
      expect.objectContaining({ messageType: "MG:Moment" }),
      { retryOnFailover: false },
    );
  });

  it("rejects more than 3 target channels", async () => {
    const client = clientReturning(() => ({ messageIds: [] }));
    await expect(
      sendGroupMessage(client, {
        ...base,
        toChannelIds: ["a", "b", "c", "d"],
        messageType: "MG:Moment",
      }),
    ).rejects.toThrow();
  });
});

describe("sendGroupStreamChunk", () => {
  it("sets the RC:StreamMsg type and tolerates an empty result", async () => {
    const client = clientReturning(() => undefined);
    await expect(
      sendGroupStreamChunk(client, {
        fromUserId: "bot",
        toChannelId: "g",
        content: { content: "hi", seq: 2, complete: false, messageId: "m" },
      }),
    ).resolves.toEqual({});
    expect(client.call.mock.calls[0]![1]).toMatchObject({ messageType: "RC:StreamMsg" });
  });
});
