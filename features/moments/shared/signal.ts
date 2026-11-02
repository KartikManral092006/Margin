import type { MomentView } from "@/features/moments/shared/schemas";
import { SYSTEM_USER_ID } from "@/features/nexconn/shared/config";
import { decodeContent, MG, roomMomentSchema } from "@/features/nexconn/shared/messages";

export type IncomingMessage = {
  channelId?: string;
  messageType?: string;
  senderUserId?: string;
  content?: unknown;
};

// Turns a Nexconn message into a moment for this room, or null. Only marginbot's messages
// count: the server sends every room moment as marginbot, and clients can't send as it.
export function momentFromSignal(
  message: IncomingMessage,
  room: { lectureId: string; channelId: string },
): MomentView | null {
  if (message.channelId !== room.channelId || message.messageType !== MG.Moment) return null;
  if (message.senderUserId !== SYSTEM_USER_ID) return null;
  const payload = decodeContent(roomMomentSchema, message.content);
  if (!payload || payload.lectureId !== room.lectureId) return null;
  return {
    id: payload.momentId,
    lectureId: payload.lectureId,
    tSec: payload.tSec,
    body: payload.text,
    parentId: payload.parentId,
    status: "open",
    upvotes: 0,
    pinned: false,
    authorName: payload.authorName,
    // Corrected to true by the store when this browser already holds the author's copy.
    mine: false,
    clientId: payload.clientId,
    createdAt: payload.createdAt,
  };
}
