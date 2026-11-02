import { connection, type NextRequest } from "next/server";
import { nexconnDisplayName } from "@/features/auth/shared/display-name";
import { json, rateLimited, requireUser } from "@/features/lectures/server/http";
import { getLectureForViewer } from "@/features/lectures/server/lectures";
import { LECTURE_ID_RE } from "@/features/lectures/shared/schemas";
import { NEXCONN_ID_RE } from "@/features/nexconn/shared/ids";
import { SYSTEM_USER_ID, SYSTEM_USER_NAME } from "@/features/nexconn/shared/config";
import { db } from "@/lib/db";
import { consumeRate } from "@/lib/rate-limit.server";

const MAX_IDS = 50;

// Display names for Nexconn user ids seen in this room's chat. Only members of the room are
// named, so the endpoint can't be used to look up arbitrary users. Never returns emails.
export async function GET(request: NextRequest, ctx: RouteContext<"/api/lectures/[id]/people">) {
  await connection();
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const limit = await consumeRate(`people:${auth.user.id}`, { window: 60, max: 60 });
  if (!limit.allowed) return rateLimited(limit);

  const { id } = await ctx.params;
  if (!LECTURE_ID_RE.test(id)) return json({ error: "not_found" }, 404);
  const viewer = await getLectureForViewer(db, id, auth.user.id);
  if (!viewer) return json({ error: "not_found" }, 404);

  const ids = (request.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean);
  if (ids.length === 0 || ids.length > MAX_IDS || !ids.every((i) => NEXCONN_ID_RE.test(i))) {
    return json({ error: "invalid_query" }, 400);
  }

  const users = await db.user.findMany({
    where: { nexconnUserId: { in: ids }, lectureMemberships: { some: { lectureId: id } } },
    select: { name: true, nexconnUserId: true },
  });
  const names: Record<string, string> = {};
  for (const user of users) {
    if (user.nexconnUserId) {
      names[user.nexconnUserId] = nexconnDisplayName({
        name: user.name,
        nexconnUserId: user.nexconnUserId,
      });
    }
  }
  if (ids.includes(SYSTEM_USER_ID)) names[SYSTEM_USER_ID] = SYSTEM_USER_NAME;
  return json({ names });
}
