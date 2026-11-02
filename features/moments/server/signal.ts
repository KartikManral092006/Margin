import type { Lecture } from "@/lib/generated/prisma/client";
import type { MomentRow } from "@/features/moments/server/moments";
import type { NexconnClient } from "@/features/nexconn/server/client";
import { sendGroupMessage } from "@/features/nexconn/server/api";
import { SYSTEM_USER_ID, SYSTEM_USER_NAME } from "@/features/nexconn/shared/config";
import { encodeContent, MG, type RoomMomentPayload } from "@/features/nexconn/shared/messages";

export type SignalDeps = {
  client: NexconnClient;
  // Issues (and caches) a token: a group send's fromUserId must be a registered user.
  registerUser: (user: { userId: string; name: string }) => Promise<unknown>;
};

export function roomMomentPayload(moment: MomentRow, authorName: string): RoomMomentPayload {
  return {
    momentId: moment.id,
    lectureId: moment.lectureId,
    tSec: moment.tSec,
    text: moment.body,
    parentId: moment.parentId,
    authorName,
    clientId: moment.clientId,
    createdAt: moment.createdAt.toISOString(),
  };
}

// Sent by the system user, never by the author: browsers accept MG:Moment only from marginbot,
// and a student's browser can only send as itself, so a fake doubt sent from a client is
// ignored. Never retried here: the group send has no idempotency key (PROGRESS decision).
export async function sendMomentSignal(
  deps: SignalDeps,
  lecture: Pick<Lecture, "nexconnChannelId">,
  moment: MomentRow,
  authorName: string,
): Promise<{ messageId: string | null }> {
  await deps.registerUser({ userId: SYSTEM_USER_ID, name: SYSTEM_USER_NAME });
  const result = await sendGroupMessage(deps.client, {
    fromUserId: SYSTEM_USER_ID,
    toChannelIds: [lecture.nexconnChannelId],
    messageType: MG.Moment,
    content: encodeContent(roomMomentPayload(moment, authorName)),
    // Day 6 sets upvotes/status/pinned as message metadata, which must be enabled at send time.
    hasMetadata: true,
  });
  return { messageId: result.messageIds?.[0]?.messageId ?? null };
}
