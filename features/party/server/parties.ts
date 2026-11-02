import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { toNexconnId } from "@/features/nexconn/shared/ids";

export const ONE_ACTIVE_INDEX = "watch_parties_one_active_key";

const withHost = {
  include: { host: { select: { name: true, nexconnUserId: true } } },
} satisfies Prisma.WatchPartyDefaultArgs;

export type PartyRow = Prisma.WatchPartyGetPayload<typeof withHost>;

export function partyChannelId(partyId: string): string {
  return toNexconnId(`pty${partyId}`);
}

function isActiveConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const meta = error.meta as
    { driverAdapterError?: { cause?: { constraint?: { index?: string } } } } | undefined;
  return meta?.driverAdapterError?.cause?.constraint?.index === ONE_ACTIVE_INDEX;
}

export function getActiveParty(db: PrismaClient, lectureId: string) {
  return db.watchParty.findFirst({ where: { lectureId, endedAt: null }, ...withHost });
}

// One active party per lecture: if two people start one at the same moment, the second gets the
// first one's party (the partial unique index decides).
export async function startParty(
  db: PrismaClient,
  input: { lectureId: string; hostId: string; id: string },
): Promise<{ party: PartyRow; created: boolean }> {
  const existing = await getActiveParty(db, input.lectureId);
  if (existing) return { party: existing, created: false };
  try {
    const party = await db.watchParty.create({
      data: {
        id: input.id,
        lectureId: input.lectureId,
        hostId: input.hostId,
        nexconnOpenChannelId: partyChannelId(input.id),
      },
      ...withHost,
    });
    return { party, created: true };
  } catch (error) {
    if (!isActiveConflict(error)) throw error;
    const winner = await getActiveParty(db, input.lectureId);
    if (!winner) throw error;
    return { party: winner, created: false };
  }
}

export async function endParty(db: PrismaClient, partyId: string, at: Date): Promise<boolean> {
  const { count } = await db.watchParty.updateMany({
    where: { id: partyId, endedAt: null },
    data: { endedAt: at },
  });
  return count === 1;
}

// A host runs one party at a time: starting one ends their others (returned, so the caller
// can clean up), which also bounds how many open channels one account can hold.
export async function endOtherHostedParties(
  db: PrismaClient,
  input: { hostId: string; keepId: string; at: Date },
): Promise<PartyRow[]> {
  const others = await db.watchParty.findMany({
    where: { hostId: input.hostId, endedAt: null, id: { not: input.keepId } },
    ...withHost,
  });
  const ended: PartyRow[] = [];
  for (const party of others) {
    if (await endParty(db, party.id, input.at)) ended.push(party);
  }
  return ended;
}
