import { NexconnApiError, type NexconnClient } from "@/features/nexconn/server/client";
import { NexconnCode } from "@/features/nexconn/shared/codes";
import { isValidCustomType } from "@/features/nexconn/shared/messages";

const BUILT_IN_PREFIX = "RC:";

export function isCode(error: unknown, code: number): boolean {
  return error instanceof NexconnApiError && error.code === code;
}

export async function issueAccessToken(
  client: NexconnClient,
  input: { userId: string; name: string; avatarUrl?: string },
): Promise<{ userId: string; accessToken: string }> {
  return client.call("/v4/auth/access-token/issue", input, { retryOnFailover: true });
}

export async function expireAccessTokens(
  client: NexconnClient,
  input: { userIds: string[]; expiresAt: number },
): Promise<void> {
  await client.call("/v4/auth/access-token/expire", input, { retryOnFailover: true });
}

export async function banUsers(
  client: NexconnClient,
  input: { userIds: string[]; durationMinutes: number },
): Promise<void> {
  await client.call("/v4/user/ban", input, { retryOnFailover: true });
}

export async function unbanUsers(
  client: NexconnClient,
  input: { userIds: string[] },
): Promise<void> {
  await client.call("/v4/user/unban", input, { retryOnFailover: true });
}

export async function createGroup(
  client: NexconnClient,
  input: { channelId: string; name: string; owner: string; userIds?: string[] },
): Promise<{ created: boolean }> {
  try {
    await client.call("/v4/group-channel/create", input, { retryOnFailover: true });
    return { created: true };
  } catch (error) {
    if (isCode(error, NexconnCode.GroupExists)) return { created: false };
    throw error;
  }
}

export async function joinGroup(
  client: NexconnClient,
  input: { channelId: string; userIds: string[] },
): Promise<void> {
  try {
    await client.call("/v4/group-channel/join", input, { retryOnFailover: true });
  } catch (error) {
    if (isCode(error, NexconnCode.AlreadyMember)) return;
    throw error;
  }
}

export async function sendGroupMessage(
  client: NexconnClient,
  input: {
    fromUserId: string;
    toChannelIds: string[];
    messageType: string;
    content: string;
    isEchoToSender?: 0 | 1;
    hasMetadata?: boolean;
    metadata?: Record<string, string>;
  },
): Promise<{ messageIds: { channelId: string; messageId: string }[] }> {
  if (!input.messageType.startsWith(BUILT_IN_PREFIX) && !isValidCustomType(input.messageType)) {
    throw new Error(`Invalid custom message type "${input.messageType}"`);
  }
  if (input.toChannelIds.length === 0 || input.toChannelIds.length > 3) {
    throw new Error("toChannelIds must contain 1 to 3 channels");
  }
  return client.call("/v4/group-channel/message/send", input, { retryOnFailover: false });
}

export async function setMessageMetadata(
  client: NexconnClient,
  input: {
    messageId: string;
    userId: string;
    channelType: 1 | 3;
    channelId: string;
    metadata: Record<string, string>;
    isEchoToSender?: 0 | 1;
  },
): Promise<void> {
  await client.call("/v4/channel-type/message/metadata/set", input, { retryOnFailover: true });
}

export async function deleteMessageMetadata(
  client: NexconnClient,
  input: {
    messageId: string;
    userId: string;
    channelType: 1 | 3;
    channelId: string;
    keys: string[];
    syncToSender?: 0 | 1;
  },
): Promise<void> {
  await client.call("/v4/channel-type/message/metadata/delete", input, { retryOnFailover: true });
}

export type StreamChunk = {
  content: string;
  seq: number;
  complete: boolean;
  type?: "text" | "markdown" | "html";
  messageId?: string;
};

export async function sendGroupStreamChunk(
  client: NexconnClient,
  input: { fromUserId: string; toChannelId: string; content: StreamChunk },
): Promise<{ messageId?: string }> {
  const result = await client.call<{ messageId?: string } | undefined>(
    "/v4/group-channel/message/stream/send",
    { ...input, messageType: "RC:StreamMsg" },
    { retryOnFailover: false },
  );
  return result ?? {};
}

export async function createOpenChannel(
  client: NexconnClient,
  input: { channelId: string; destroyType?: 0 | 1; ttlMinutes?: number },
): Promise<{ created: boolean }> {
  try {
    await client.call("/v4/open-channel/create", input, { retryOnFailover: true });
    return { created: true };
  } catch (error) {
    if (isCode(error, NexconnCode.OpenChannelExists)) return { created: false };
    throw error;
  }
}

export async function destroyOpenChannels(
  client: NexconnClient,
  input: { channelIds: string[] },
): Promise<void> {
  await client.call("/v4/open-channel/destroy", input, { retryOnFailover: true });
}

export async function sendSystemMessage(
  client: NexconnClient,
  input: {
    fromUserId: string;
    toUserIds: string[];
    messageType: string;
    content: string;
    pushContent?: string;
  },
): Promise<{ messageIds: { userId: string; messageId: string }[] }> {
  if (!input.messageType.startsWith(BUILT_IN_PREFIX) && !isValidCustomType(input.messageType)) {
    throw new Error(`Invalid custom message type "${input.messageType}"`);
  }
  return client.call("/v4/system-channel/message/send", input, { retryOnFailover: false });
}
