import { after, connection, type NextRequest } from "next/server";
import { nexconnDisplayName } from "@/features/auth/shared/display-name";
import { json, rateLimited, requireUser } from "@/features/lectures/server/http";
import { getLectureForViewer, joinLecture } from "@/features/lectures/server/lectures";
import { LECTURE_ID_RE } from "@/features/lectures/shared/schemas";
import {
  clearState,
  closePartyChannel,
  openPartyChannel,
  readState,
  type StoredState,
} from "@/features/party/server";
import {
  endOtherHostedParties,
  endParty,
  getActiveParty,
  startParty,
  type PartyRow,
} from "@/features/party/server/parties";
import { PARTY_MAX_MS, PARTY_STALE_MS } from "@/features/party/shared/sync";
import { db } from "@/lib/db";
import { newAlnumId } from "@/lib/ids";
import { consumeRate } from "@/lib/rate-limit.server";
import { checkSameOriginJson } from "@/lib/request-guard";

type Ctx = RouteContext<"/api/lectures/[id]/party">;

function partyView(party: PartyRow, viewerId: string) {
  const hostNexconnId = party.host.nexconnUserId ?? party.hostId;
  return {
    id: party.id,
    channelId: party.nexconnOpenChannelId,
    hostName: nexconnDisplayName({ name: party.host.name, nexconnUserId: hostNexconnId }),
    // Viewers accept MG:Sync only from this Nexconn user.
    hostNexconnUserId: hostNexconnId,
    isHost: party.hostId === viewerId,
    startedAt: party.startedAt.toISOString(),
  };
}

async function room(request: NextRequest, ctx: Ctx) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth;
  const { id } = await ctx.params;
  if (!LECTURE_ID_RE.test(id)) {
    return { ok: false as const, response: json({ error: "not_found" }, 404) };
  }
  const viewer = await getLectureForViewer(db, id, auth.user.id);
  if (!viewer) return { ok: false as const, response: json({ error: "not_found" }, 404) };
  return { ok: true as const, user: auth.user, lectureId: id, member: viewer.membership !== null };
}

function finish(party: PartyRow) {
  after(async () => {
    await clearState(party.id);
    await closePartyChannel(party.nexconnOpenChannelId);
  });
}

// A party is over when its host has been silent for 2 minutes or it hit the 4-hour cap. A Redis
// error is not silence: the party goes on (without a state this time).
async function partyStatus(party: PartyRow): Promise<{ over: boolean; state: StoredState | null }> {
  const now = Date.now();
  if (now - party.startedAt.getTime() > PARTY_MAX_MS) return { over: true, state: null };
  let state: StoredState | null;
  try {
    state = await readState(party.id);
  } catch {
    return { over: false, state: null };
  }
  const lastSign = state?.savedAt ?? party.startedAt.getTime();
  return { over: now - lastSign > PARTY_STALE_MS, state };
}

// The active party (if any) and the host's latest state. A party that is over ends here.
export async function GET(request: NextRequest, ctx: Ctx) {
  await connection();
  const r = await room(request, ctx);
  if (!r.ok) return r.response;
  const limit = await consumeRate(`party:read:${r.user.id}`, { window: 60, max: 120 });
  if (!limit.allowed) return rateLimited(limit);

  const party = await getActiveParty(db, r.lectureId);
  if (!party) return json({ party: null, state: null });

  const { over, state } = await partyStatus(party);
  if (over) {
    if (await endParty(db, party.id, new Date())) finish(party);
    return json({ party: null, state: null });
  }
  return json({ party: partyView(party, r.user.id), state });
}

// Start a party (or get the one already running).
export async function POST(request: NextRequest, ctx: Ctx) {
  await connection();
  const guard = checkSameOriginJson(request);
  if (!guard.ok) return json({ error: guard.reason }, guard.status);
  const r = await room(request, ctx);
  if (!r.ok) return r.response;
  const limit = await consumeRate(`party:start:${r.user.id}`, { window: 600, max: 5 });
  if (!limit.allowed) return rateLimited(limit);

  if (!r.member) await joinLecture(db, r.lectureId, r.user.id);
  // A party that is over (its host left) ends first, so Start never returns a dead party.
  const current = await getActiveParty(db, r.lectureId);
  if (current && (await partyStatus(current)).over) {
    if (await endParty(db, current.id, new Date())) finish(current);
  }
  const { party, created } = await startParty(db, {
    lectureId: r.lectureId,
    hostId: r.user.id,
    id: newAlnumId(),
  });
  if (created) {
    const others = await endOtherHostedParties(db, {
      hostId: r.user.id,
      keepId: party.id,
      at: new Date(),
    });
    for (const other of others) finish(other);
  }
  // Also when the host asks again (its browser couldn't enter the channel): creating is safe to
  // repeat.
  if (created || party.hostId === r.user.id) {
    after(() => openPartyChannel(party.nexconnOpenChannelId).then(() => undefined));
  }
  return json({ party: partyView(party, r.user.id), created }, created ? 201 : 200);
}

// The host ends the party.
export async function DELETE(request: NextRequest, ctx: Ctx) {
  await connection();
  const guard = checkSameOriginJson(request);
  if (!guard.ok) return json({ error: guard.reason }, guard.status);
  const r = await room(request, ctx);
  if (!r.ok) return r.response;

  const party = await getActiveParty(db, r.lectureId);
  if (!party) return json({ error: "not_found" }, 404);
  if (party.hostId !== r.user.id) return json({ error: "not_host" }, 403);
  if (await endParty(db, party.id, new Date())) finish(party);
  return json({ ended: true });
}
