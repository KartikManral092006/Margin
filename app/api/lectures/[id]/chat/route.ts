import { after, connection, type NextRequest } from "next/server";
import { nexconnDisplayName } from "@/features/auth/shared/display-name";
import { json, rateLimited, requireUser } from "@/features/lectures/server/http";
import { roomChatDeps } from "@/features/lectures/server";
import { getLectureForViewer } from "@/features/lectures/server/lectures";
import { ChatUnavailableError, ensureRoomChat } from "@/features/lectures/server/room-chat";
import { LECTURE_ID_RE } from "@/features/lectures/shared/schemas";
import { resendMomentSignals } from "@/features/moments/server";
import { NexconnNotConfiguredError } from "@/features/nexconn/server";
import { NexconnApiError } from "@/features/nexconn/server/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { consumeRate } from "@/lib/rate-limit.server";
import { checkSameOriginJson } from "@/lib/request-guard";

// Sets up the room's Nexconn group for this user (create if needed, then join). Chat failures
// never break the room itself: they come back as 503 chat_unavailable.
export async function POST(request: NextRequest, ctx: RouteContext<"/api/lectures/[id]/chat">) {
  await connection();
  const guard = checkSameOriginJson(request);
  if (!guard.ok) return json({ error: guard.reason }, guard.status);

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const limit = await consumeRate(`nx:chat:${auth.user.id}`, { window: 600, max: 10 });
  if (!limit.allowed) return rateLimited(limit);

  const { id } = await ctx.params;
  if (!LECTURE_ID_RE.test(id)) return json({ error: "not_found" }, 404);

  const viewer = await getLectureForViewer(db, id, auth.user.id);
  if (!viewer) return json({ error: "not_found" }, 404);

  const nexconnUserId = auth.user.nexconnUserId;
  if (!nexconnUserId) return json({ error: "nexconn_user_missing" }, 409);

  try {
    const result = await ensureRoomChat(roomChatDeps(), viewer.lecture, {
      id: auth.user.id,
      nexconnUserId,
      name: nexconnDisplayName({ name: auth.user.name, nexconnUserId }),
    });
    // Doubts posted before the group existed get their live signal now.
    if (result.chat === "ok") {
      after(() =>
        resendMomentSignals(id).catch((error: unknown) =>
          logger.warn({ err: error, lectureId: id }, "moment resend failed"),
        ),
      );
    }
    return json(result);
  } catch (error) {
    if (error instanceof NexconnNotConfiguredError) {
      return json({ error: "nexconn_not_configured" }, 503);
    }
    if (error instanceof ChatUnavailableError) {
      return json({ error: "chat_unavailable", reason: error.reason }, 503);
    }
    if (error instanceof NexconnApiError) {
      logger.warn(
        { path: error.path, httpStatus: error.httpStatus, code: error.code, lectureId: id },
        "room chat setup failed",
      );
      return json({ error: "chat_unavailable" }, 503);
    }
    throw error;
  }
}
