import { connection, type NextRequest } from "next/server";
import { json, rateLimited, requireUser } from "@/features/lectures/server/http";
import { getLectureForViewer, joinLecture } from "@/features/lectures/server/lectures";
import { LECTURE_ID_RE } from "@/features/lectures/shared/schemas";
import { setLost } from "@/features/heatmap/server/heatmap";
import { lostBody, lostBucket } from "@/features/heatmap/shared/heatmap";
import { db } from "@/lib/db";
import { consumeRate } from "@/lib/rate-limit.server";
import { redis } from "@/lib/redis";
import { checkSameOriginJson, readJsonBody, TOO_LARGE } from "@/lib/request-guard";

type Ctx = RouteContext<"/api/lectures/[id]/lost">;

// "I'm lost" at tSec (POST) or taking it back (DELETE). One per person per 15-second bucket;
// repeating either is harmless.
async function handle(request: NextRequest, ctx: Ctx, lost: boolean) {
  await connection();
  const guard = checkSameOriginJson(request);
  if (!guard.ok) return json({ error: guard.reason }, guard.status);
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const limit = await consumeRate(`hm:lost:${auth.user.id}`, { window: 60, max: 20 });
  if (!limit.allowed) return rateLimited(limit);

  const { id } = await ctx.params;
  if (!LECTURE_ID_RE.test(id)) return json({ error: "not_found" }, 404);
  const raw = await readJsonBody(request);
  if (raw === TOO_LARGE) return json({ error: "body_too_large" }, 413);
  const body = lostBody.safeParse(raw);
  if (!body.success) return json({ error: "invalid_body" }, 400);

  const viewer = await getLectureForViewer(db, id, auth.user.id);
  if (!viewer) return json({ error: "not_found" }, 404);
  // Like asking or voting, marking a spot makes you a member of the room.
  if (lost && !viewer.membership) await joinLecture(db, id, auth.user.id);

  const bucket = lostBucket(body.data.tSec);
  const { changed, version } = await setLost(db, redis, {
    lectureId: id,
    userId: auth.user.id,
    bucket,
    lost,
  });
  return json({ bucket, lost, changed, version });
}

export function POST(request: NextRequest, ctx: Ctx) {
  return handle(request, ctx, true);
}

export function DELETE(request: NextRequest, ctx: Ctx) {
  return handle(request, ctx, false);
}
