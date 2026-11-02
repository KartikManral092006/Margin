import { connection, type NextRequest } from "next/server";
import { json, rateLimited, requireUser } from "@/features/lectures/server/http";
import { getLectureForViewer } from "@/features/lectures/server/lectures";
import { LECTURE_ID_RE } from "@/features/lectures/shared/schemas";
import { MARKER_BUCKET_SEC, markerBuckets } from "@/features/moments/server/moments";
import { db } from "@/lib/db";
import { consumeRate } from "@/lib/rate-limit.server";

// Where doubts cluster across the whole lecture, for the markers under the player.
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/lectures/[id]/moments/markers">,
) {
  await connection();
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const limit = await consumeRate(`mo:markers:${auth.user.id}`, { window: 60, max: 30 });
  if (!limit.allowed) return rateLimited(limit);

  const { id } = await ctx.params;
  if (!LECTURE_ID_RE.test(id)) return json({ error: "not_found" }, 404);
  const viewer = await getLectureForViewer(db, id, auth.user.id);
  if (!viewer) return json({ error: "not_found" }, 404);

  return json({ bucketSec: MARKER_BUCKET_SEC, buckets: await markerBuckets(db, id) });
}
