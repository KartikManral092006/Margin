import { connection, type NextRequest } from "next/server";
import { json, rateLimited, requireUser } from "@/features/lectures/server/http";
import { getLectureForViewer, joinLecture } from "@/features/lectures/server/lectures";
import { LECTURE_ID_RE } from "@/features/lectures/shared/schemas";
import { db } from "@/lib/db";
import { consumeRate } from "@/lib/rate-limit.server";
import { checkSameOriginJson } from "@/lib/request-guard";

// Postgres only: joining a room never touches Nexconn (that happens in ../chat).
export async function POST(request: NextRequest, ctx: RouteContext<"/api/lectures/[id]/join">) {
  await connection();
  const guard = checkSameOriginJson(request);
  if (!guard.ok) return json({ error: guard.reason }, guard.status);

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const limit = await consumeRate(`lec:join:${auth.user.id}`, { window: 600, max: 60 });
  if (!limit.allowed) return rateLimited(limit);

  const { id } = await ctx.params;
  if (!LECTURE_ID_RE.test(id)) return json({ error: "not_found" }, 404);

  const viewer = await getLectureForViewer(db, id, auth.user.id);
  if (!viewer) return json({ error: "not_found" }, 404);

  return json(await joinLecture(db, id, auth.user.id));
}
