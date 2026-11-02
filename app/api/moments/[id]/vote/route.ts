import { after, connection, type NextRequest } from "next/server";
import { json, rateLimited, requireUser } from "@/features/lectures/server/http";
import { broadcastMomentUpdate } from "@/features/moments/server";
import { ACTION_ERROR_STATUS, momentContext } from "@/features/moments/server/http";
import { setVote, toMomentView } from "@/features/moments/server/moments";
import { db } from "@/lib/db";
import { consumeRate } from "@/lib/rate-limit.server";
import { checkSameOriginJson } from "@/lib/request-guard";

const VOTES_PER_MINUTE = { window: 60, max: 30 };

type Ctx = RouteContext<"/api/moments/[id]/vote">;

// POST adds my vote ("I have this doubt too"), DELETE takes it back. Both are idempotent.
async function handle(request: NextRequest, ctx: Ctx, on: boolean) {
  await connection();
  const guard = checkSameOriginJson(request);
  if (!guard.ok) return json({ error: guard.reason }, guard.status);

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const limit = await consumeRate(`mo:vote:${auth.user.id}`, VOTES_PER_MINUTE);
  if (!limit.allowed) return rateLimited(limit);

  const { id } = await ctx.params;
  const context = await momentContext(id, auth.user.id);
  if (!context.ok) return context.response;

  const result = await setVote(db, {
    momentId: id,
    lectureId: context.lectureId,
    userId: auth.user.id,
    on,
  });
  if (!result.ok) return json({ error: result.error }, ACTION_ERROR_STATUS[result.error]);

  if (result.changed) after(() => broadcastMomentUpdate(result.moment));
  return json({ moment: toMomentView(result.moment, auth.user.id) });
}

export function POST(request: NextRequest, ctx: Ctx) {
  return handle(request, ctx, true);
}

export function DELETE(request: NextRequest, ctx: Ctx) {
  return handle(request, ctx, false);
}
