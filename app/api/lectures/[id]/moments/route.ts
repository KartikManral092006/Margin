import { after, connection, type NextRequest } from "next/server";
import { json, rateLimited, requireUser } from "@/features/lectures/server/http";
import { getLectureForViewer, joinLecture } from "@/features/lectures/server/lectures";
import { LECTURE_ID_RE } from "@/features/lectures/shared/schemas";
import { deliverMomentSignals } from "@/features/moments/server";
import {
  createMoment,
  listMomentsByIds,
  listMomentsInWindow,
  toMomentView,
} from "@/features/moments/server/moments";
import { createMomentBody, listMomentsQuery } from "@/features/moments/shared/schemas";
import { db } from "@/lib/db";
import { newAlnumId } from "@/lib/ids";
import { consumeRate } from "@/lib/rate-limit.server";
import { checkSameOriginJson, readJsonBody, TOO_LARGE } from "@/lib/request-guard";

const POSTS_PER_MINUTE = { window: 60, max: 10 };
const READS_PER_MINUTE = { window: 60, max: 120 };

type Ctx = RouteContext<"/api/lectures/[id]/moments">;

// ?from=&to= (seconds) for a window around the playhead, or ?ids=a,b to confirm moments
// announced over Nexconn.
export async function GET(request: NextRequest, ctx: Ctx) {
  await connection();
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const limit = await consumeRate(`mo:read:${auth.user.id}`, READS_PER_MINUTE);
  if (!limit.allowed) return rateLimited(limit);

  const { id } = await ctx.params;
  if (!LECTURE_ID_RE.test(id)) return json({ error: "not_found" }, 404);
  const viewer = await getLectureForViewer(db, id, auth.user.id);
  if (!viewer) return json({ error: "not_found" }, 404);

  const query = listMomentsQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) return json({ error: "invalid_query" }, 400);

  const rows =
    query.data.kind === "ids"
      ? await listMomentsByIds(db, id, query.data.ids)
      : await listMomentsInWindow(db, id, query.data.from, query.data.to);
  return json({ moments: rows.map((row) => toMomentView(row, auth.user.id)) });
}

export async function POST(request: NextRequest, ctx: Ctx) {
  await connection();
  const guard = checkSameOriginJson(request);
  if (!guard.ok) return json({ error: guard.reason }, guard.status);

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const limit = await consumeRate(`mo:post:${auth.user.id}`, POSTS_PER_MINUTE);
  if (!limit.allowed) return rateLimited(limit);

  const { id } = await ctx.params;
  if (!LECTURE_ID_RE.test(id)) return json({ error: "not_found" }, 404);
  const viewer = await getLectureForViewer(db, id, auth.user.id);
  if (!viewer) return json({ error: "not_found" }, 404);

  const raw = await readJsonBody(request);
  if (raw === TOO_LARGE) return json({ error: "body_too_large" }, 413);
  const body = createMomentBody.safeParse(raw);
  if (!body.success) return json({ error: "invalid_body" }, 400);

  // Asking a doubt makes you a member of the room.
  if (!viewer.membership) await joinLecture(db, id, auth.user.id);

  // Postgres first; the Nexconn signal goes out after the response.
  const result = await createMoment(db, {
    ...body.data,
    lectureId: id,
    userId: auth.user.id,
    id: newAlnumId(),
  });
  if (!result.ok) return json({ error: result.error }, 422);

  if (result.created) after(() => deliverMomentSignals(id, result.moment));
  return json({ moment: toMomentView(result.moment, auth.user.id) }, result.created ? 201 : 200);
}
