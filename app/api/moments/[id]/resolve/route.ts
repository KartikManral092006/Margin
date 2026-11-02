import { after, connection, type NextRequest } from "next/server";
import { z } from "zod";
import { json, rateLimited, requireUser } from "@/features/lectures/server/http";
import { broadcastMomentUpdate } from "@/features/moments/server";
import { ACTION_ERROR_STATUS, momentContext } from "@/features/moments/server/http";
import { setResolved, toMomentView } from "@/features/moments/server/moments";
import { db } from "@/lib/db";
import { consumeRate } from "@/lib/rate-limit.server";
import { checkSameOriginJson, readJsonBody, TOO_LARGE } from "@/lib/request-guard";

const RESOLVES_PER_MINUTE = { window: 60, max: 20 };
const bodySchema = z.strictObject({ resolved: z.boolean() });

// The asker marks their doubt resolved, or reopens it.
export async function POST(request: NextRequest, ctx: RouteContext<"/api/moments/[id]/resolve">) {
  await connection();
  const guard = checkSameOriginJson(request);
  if (!guard.ok) return json({ error: guard.reason }, guard.status);

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const limit = await consumeRate(`mo:resolve:${auth.user.id}`, RESOLVES_PER_MINUTE);
  if (!limit.allowed) return rateLimited(limit);

  const raw = await readJsonBody(request);
  if (raw === TOO_LARGE) return json({ error: "body_too_large" }, 413);
  const body = bodySchema.safeParse(raw);
  if (!body.success) return json({ error: "invalid_body" }, 400);

  const { id } = await ctx.params;
  const context = await momentContext(id, auth.user.id);
  if (!context.ok) return context.response;

  const result = await setResolved(db, {
    momentId: id,
    lectureId: context.lectureId,
    userId: auth.user.id,
    resolved: body.data.resolved,
  });
  if (!result.ok) return json({ error: result.error }, ACTION_ERROR_STATUS[result.error]);

  if (result.changed) after(() => broadcastMomentUpdate(result.moment));
  return json({ moment: toMomentView(result.moment, auth.user.id) });
}
