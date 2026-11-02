import "server-only";
import { nexconnDisplayName } from "@/features/auth/shared/display-name";
import {
  momentsToResend,
  recordSendResult,
  type MomentRow,
} from "@/features/moments/server/moments";
import { sendMomentSignal } from "@/features/moments/server/signal";
import { getNexconn } from "@/features/nexconn/server";
import { getChatToken } from "@/features/nexconn/server/tokens";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

function authorName(moment: MomentRow): string {
  if (!moment.user) return "Former member";
  return nexconnDisplayName({
    name: moment.user.name,
    nexconnUserId: moment.user.nexconnUserId ?? moment.id,
  });
}

async function deliver(lectureId: string, moment: MomentRow): Promise<void> {
  // Read the room fresh: its group may have been created after the request started.
  const lecture = await db.lecture.findUnique({
    where: { id: lectureId },
    select: { nexconnChannelId: true, nexconnGroupReadyAt: true },
  });
  if (!lecture?.nexconnGroupReadyAt) {
    // No group yet: viewers still get it from Postgres; /chat resends once the group exists.
    await recordSendResult(db, moment.id, { ok: false, attempted: false });
    return;
  }
  try {
    const { messageId } = await sendMomentSignal(
      { client: getNexconn(), registerUser: getChatToken },
      lecture,
      moment,
      authorName(moment),
    );
    await recordSendResult(db, moment.id, { ok: true, messageId });
  } catch (error) {
    logger.warn({ err: error, momentId: moment.id }, "moment signal failed");
    await recordSendResult(db, moment.id, { ok: false, attempted: true });
  }
}

// Sends the live signal for moments that haven't had one (failed, or skipped before the room
// had a group). Called after a new moment and right after /chat creates or joins the group.
export async function resendMomentSignals(lectureId: string, skipId?: string) {
  for (const moment of await momentsToResend(db, lectureId, new Date())) {
    if (moment.id !== skipId) await deliver(lectureId, moment);
  }
}

// Runs after the POST response (next/server `after`).
export async function deliverMomentSignals(lectureId: string, moment: MomentRow) {
  try {
    await deliver(lectureId, moment);
    await resendMomentSignals(lectureId, moment.id);
  } catch (error) {
    logger.error({ err: error, momentId: moment.id }, "moment delivery crashed");
  }
}
