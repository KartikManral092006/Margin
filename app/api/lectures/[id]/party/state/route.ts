import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { json, rateLimited, requireUser } from "@/features/lectures/server/http";
import { LECTURE_ID_RE } from "@/features/lectures/shared/schemas";
import { saveState } from "@/features/party/server";
import { getActiveParty } from "@/features/party/server/parties";
import { partyStateSchema } from "@/features/party/shared/sync";
import { db } from "@/lib/db";
import { consumeRate } from "@/lib/rate-limit.server";
import { checkSameOriginJson, readJsonBody, TOO_LARGE } from "@/lib/request-guard";

const bodySchema = partyStateSchema.extend({ partyId: z.string().regex(/^[A-Za-z0-9]{32}$/) });
// A host clock estimate further off than this is replaced by our own receive time (its error is
// then just the request's travel time) instead of rejecting the state and stranding viewers.
const MAX_CLOCK_GAP_MS = 5000;

// Only the host saves the party's state (every 5 s and on play, pause and seek).
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/lectures/[id]/party/state">,
) {
  await connection();
  const guard = checkSameOriginJson(request);
  if (!guard.ok) return json({ error: guard.reason }, guard.status);
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const limit = await consumeRate(`party:state:${auth.user.id}`, { window: 60, max: 60 });
  if (!limit.allowed) return rateLimited(limit);

  const { id } = await ctx.params;
  if (!LECTURE_ID_RE.test(id)) return json({ error: "not_found" }, 404);
  const raw = await readJsonBody(request);
  if (raw === TOO_LARGE) return json({ error: "body_too_large" }, 413);
  const body = bodySchema.safeParse(raw);
  if (!body.success) return json({ error: "invalid_body" }, 400);

  const party = await getActiveParty(db, id);
  if (!party || party.id !== body.data.partyId) return json({ error: "not_found" }, 404);
  if (party.hostId !== auth.user.id) return json({ error: "not_host" }, 403);

  const now = Date.now();
  const { partyId: _partyId, ...state } = body.data;
  if (Math.abs(state.hostSentAt - now) > MAX_CLOCK_GAP_MS) state.hostSentAt = now;
  await saveState(party.id, state, now);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
