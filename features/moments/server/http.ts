import "server-only";
import { getLectureForViewer, joinLecture } from "@/features/lectures/server/lectures";
import { json } from "@/features/lectures/server/http";
import { MOMENT_ID_RE } from "@/features/moments/shared/schemas";
import { db } from "@/lib/db";

// Resolves a moment id to its room and checks the viewer may act there (public rooms only
// for now). Acting on a moment makes the viewer a member of the room.
export async function momentContext(
  momentId: string,
  userId: string,
): Promise<{ ok: true; lectureId: string } | { ok: false; response: Response }> {
  const notFound = { ok: false as const, response: json({ error: "not_found" }, 404) };
  if (!MOMENT_ID_RE.test(momentId)) return notFound;
  const moment = await db.moment.findUnique({
    where: { id: momentId },
    select: { lectureId: true },
  });
  if (!moment) return notFound;
  const viewer = await getLectureForViewer(db, moment.lectureId, userId);
  if (!viewer) return notFound;
  if (!viewer.membership) await joinLecture(db, moment.lectureId, userId);
  return { ok: true, lectureId: moment.lectureId };
}

export const ACTION_ERROR_STATUS = {
  not_found: 404,
  own_moment: 422,
  not_author: 403,
  is_reply: 422,
} as const;
