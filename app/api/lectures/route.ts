import { connection, type NextRequest } from "next/server";
import { json, rateLimited, requireUser } from "@/features/lectures/server/http";
import { openDeps } from "@/features/lectures/server";
import { listPublicLectures, toSummary } from "@/features/lectures/server/lectures";
import { openPublicLecture } from "@/features/lectures/server/open";
import { listLecturesQuery, openLectureBody } from "@/features/lectures/shared/schemas";
import { parseYouTubeUrl } from "@/features/lectures/shared/youtube";
import { db } from "@/lib/db";
import { consumeRate } from "@/lib/rate-limit.server";
import { checkSameOriginJson } from "@/lib/request-guard";

export async function GET(request: NextRequest) {
  await connection();
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const limit = await consumeRate(`lec:list:${auth.user.id}`, { window: 60, max: 60 });
  if (!limit.allowed) return rateLimited(limit);

  const query = listLecturesQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) return json({ error: "invalid_query" }, 400);

  const lectures = await listPublicLectures(db, query.data);
  return json({ lectures: lectures.map(toSummary) });
}

export async function POST(request: Request) {
  await connection();
  const guard = checkSameOriginJson(request);
  if (!guard.ok) return json({ error: guard.reason }, guard.status);

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const limit = await consumeRate(`lec:open:${auth.user.id}`, { window: 600, max: 30 });
  if (!limit.allowed) return rateLimited(limit);

  const body = openLectureBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "invalid_body" }, 400);
  if (body.data.visibility === "private")
    return json({ error: "private_rooms_not_available" }, 422);

  const parsed = parseYouTubeUrl(body.data.url);
  if (!parsed) return json({ error: "invalid_url" }, 422);

  const result = await openPublicLecture(openDeps(), auth.user.id, parsed.videoId);
  if (!result.ok) {
    if (result.error === "rate_limited") return rateLimited(result);
    return json({ error: result.error }, result.error === "youtube_unavailable" ? 503 : 422);
  }
  return json(
    { lecture: toSummary(result.lecture), created: result.created, startSec: parsed.startSec },
    result.created ? 201 : 200,
  );
}
