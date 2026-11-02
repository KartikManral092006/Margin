import { connection, type NextRequest } from "next/server";
import { json, requireUser } from "@/features/lectures/server/http";
import { LECTURE_ID_RE } from "@/features/lectures/shared/schemas";
import { leavePresence } from "@/features/presence/server/presence";
import { redis } from "@/lib/redis";
import { checkSameOriginJson } from "@/lib/request-guard";

// Sent with navigator.sendBeacon when the tab closes, so others stop seeing me at once instead
// of after the 45 s expiry. Only ever removes the caller.
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/lectures/[id]/presence/leave">,
) {
  await connection();
  const guard = checkSameOriginJson(request);
  if (!guard.ok) return json({ error: guard.reason }, guard.status);
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!LECTURE_ID_RE.test(id)) return json({ error: "not_found" }, 404);
  await leavePresence(redis, id, auth.user.id);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
