import type { Lecture, PrismaClient } from "@/lib/generated/prisma/client";
import { joinLecture } from "@/features/lectures/server/lectures";
import type { NexconnClient } from "@/features/nexconn/server/client";
import { createGroup, isCode, joinGroup } from "@/features/nexconn/server/api";
import { NexconnCode } from "@/features/nexconn/shared/codes";
import { SYSTEM_USER_ID, SYSTEM_USER_NAME } from "@/features/nexconn/shared/config";

export class ChatUnavailableError extends Error {
  override readonly name = "ChatUnavailableError";

  constructor(readonly reason: "group_quota") {
    super(`Room chat unavailable: ${reason}`);
  }
}

export type RoomChatDeps = {
  db: PrismaClient;
  client: NexconnClient;
  // Issues (and caches) an access token, which is how Nexconn registers a user.
  registerUser: (user: { userId: string; name: string }) => Promise<unknown>;
  allowGroupCreate: () => Promise<boolean>;
};

export type RoomChatResult = { chat: "ok"; channelId: string } | { chat: "full" };

// Called only when a user opens chat, never on page view: rooms work from Postgres alone,
// and only rooms people actually chat in get a Nexconn group. Every step is idempotent.
export async function ensureRoomChat(
  deps: RoomChatDeps,
  lecture: Lecture,
  user: { id: string; nexconnUserId: string; name: string },
): Promise<RoomChatResult> {
  await joinLecture(deps.db, lecture.id, user.id);
  const membership = await deps.db.lectureMembership.findUniqueOrThrow({
    where: { lectureId_userId: { lectureId: lecture.id, userId: user.id } },
    select: { nexconnJoinedAt: true },
  });
  if (membership.nexconnJoinedAt) return { chat: "ok", channelId: lecture.nexconnChannelId };

  // Token before join: joining a never-registered user is undocumented.
  await deps.registerUser({ userId: user.nexconnUserId, name: user.name });

  const ensureGroup = async () => {
    if (!(await deps.allowGroupCreate())) throw new ChatUnavailableError("group_quota");
    await deps.registerUser({ userId: SYSTEM_USER_ID, name: SYSTEM_USER_NAME });
    await createGroup(deps.client, {
      channelId: lecture.nexconnChannelId,
      name: lecture.youtubeId,
      owner: SYSTEM_USER_ID,
    });
    await deps.db.lecture.updateMany({
      where: { id: lecture.id },
      data: { nexconnGroupReadyAt: new Date() },
    });
  };

  if (!lecture.nexconnGroupReadyAt) await ensureGroup();

  const join = () =>
    joinGroup(deps.client, { channelId: lecture.nexconnChannelId, userIds: [user.nexconnUserId] });
  try {
    await join();
  } catch (error) {
    if (isCode(error, NexconnCode.GroupFull)) return { chat: "full" };
    if (!isCode(error, NexconnCode.GroupMissing)) throw error;
    // The group was dismissed or never created although we recorded it: create it again once.
    await ensureGroup();
    try {
      await join();
    } catch (retryError) {
      if (isCode(retryError, NexconnCode.GroupFull)) return { chat: "full" };
      throw retryError;
    }
  }

  await deps.db.lectureMembership.update({
    where: { lectureId_userId: { lectureId: lecture.id, userId: user.id } },
    data: { nexconnJoinedAt: new Date() },
  });
  return { chat: "ok", channelId: lecture.nexconnChannelId };
}
