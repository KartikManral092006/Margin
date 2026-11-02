import { connection, type NextRequest } from "next/server";
import { json, rateLimited, requireUser } from "@/features/lectures/server/http";
import { getLectureForViewer } from "@/features/lectures/server/lectures";
import { LECTURE_ID_RE } from "@/features/lectures/shared/schemas";
import { myLostBuckets, readHeatmap } from "@/features/heatmap/server/heatmap";
import { LOST_BUCKET_SEC, publicHeatmap } from "@/features/heatmap/shared/heatmap";
import { db } from "@/lib/db";
import { consumeRate } from "@/lib/rate-limit.server";
import { redis } from "@/lib/redis";

// Where people got lost across the whole lecture (counts per 15-second bucket, no names, only
// spots at least 2 people marked), and which buckets this viewer marked. Live changes arrive
// on the room's presence stream.
export async function GET(request: NextRequest, ctx: RouteContext<"/api/lectures/[id]/heatmap">) {
  await connection();
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const limit = await consumeRate(`hm:read:${auth.user.id}`, { window: 60, max: 60 });
  if (!limit.allowed) return rateLimited(limit);

  const { id } = await ctx.params;
  if (!LECTURE_ID_RE.test(id)) return json({ error: "not_found" }, 404);
  const viewer = await getLectureForViewer(db, id, auth.user.id);
  if (!viewer) return json({ error: "not_found" }, 404);

  const [heatmap, mine] = await Promise.all([
    readHeatmap(db, redis, id),
    myLostBuckets(db, id, auth.user.id),
  ]);
  return json({ bucketSec: LOST_BUCKET_SEC, ...publicHeatmap(heatmap), mine });
}
