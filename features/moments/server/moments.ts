import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { MomentStatus, SendStatus } from "@/lib/generated/prisma/enums";
import { nexconnDisplayName } from "@/features/auth/shared/display-name";
import type { CreateMomentInput, MomentView } from "@/features/moments/shared/schemas";
import { MAX_MOMENTS_PER_GET } from "@/features/moments/shared/schemas";

export const MOMENT_CLIENT_INDEX = "moments_userId_clientId_key";
export const MAX_SEND_ATTEMPTS = 3;

const momentWithAuthor = {
  include: { user: { select: { name: true, nexconnUserId: true } } },
} satisfies Prisma.MomentDefaultArgs;

export type MomentRow = Prisma.MomentGetPayload<typeof momentWithAuthor>;

// Author plus whether this viewer has voted (at most one row).
function forViewer(viewerId: string) {
  return {
    include: {
      user: { select: { name: true, nexconnUserId: true } },
      votes: { where: { userId: viewerId }, select: { userId: true } },
    },
  } satisfies Prisma.MomentDefaultArgs;
}

export type ViewerMomentRow = MomentRow & { votes?: { userId: string }[] };

export function toMomentView(row: ViewerMomentRow, viewerId: string): MomentView {
  const mine = row.userId === viewerId;
  return {
    id: row.id,
    lectureId: row.lectureId,
    tSec: row.tSec,
    body: row.body,
    parentId: row.parentId,
    status: row.status,
    upvotes: row.upvotes,
    pinned: row.pinnedAt !== null,
    // Never the email: other students see this name.
    authorName: row.user
      ? nexconnDisplayName({ name: row.user.name, nexconnUserId: row.user.nexconnUserId ?? row.id })
      : "Former member",
    mine,
    clientId: mine ? row.clientId : null,
    votedByMe: row.votes?.some((vote) => vote.userId === viewerId) ?? false,
    nexconnMessageId: row.nexconnMessageId,
    createdAt: row.createdAt.toISOString(),
  };
}

function isClientIdConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const meta = error.meta as
    { driverAdapterError?: { cause?: { constraint?: { index?: string } } } } | undefined;
  return meta?.driverAdapterError?.cause?.constraint?.index === MOMENT_CLIENT_INDEX;
}

export type CreateResult =
  { ok: true; moment: MomentRow; created: boolean } | { ok: false; error: "parent_not_found" };

// Idempotent per (user, clientId): a retried POST returns the moment it already made.
export async function createMoment(
  db: PrismaClient,
  input: CreateMomentInput & { lectureId: string; userId: string; id: string },
): Promise<CreateResult> {
  const existing = await db.moment.findUnique({
    where: { userId_clientId: { userId: input.userId, clientId: input.clientId } },
    ...momentWithAuthor,
  });
  if (existing) return { ok: true, moment: existing, created: false };

  let tSec = Math.floor(input.tSec);
  if (input.parentId) {
    // Replies stay one level deep, inside the same lecture, at the parent's second.
    const parent = await db.moment.findFirst({
      where: { id: input.parentId, lectureId: input.lectureId, parentId: null },
      select: { tSec: true },
    });
    if (!parent) return { ok: false, error: "parent_not_found" };
    tSec = parent.tSec;
  }

  try {
    const moment = await db.moment.create({
      data: {
        id: input.id,
        lectureId: input.lectureId,
        userId: input.userId,
        clientId: input.clientId,
        tSec,
        body: input.body,
        parentId: input.parentId ?? null,
      },
      ...momentWithAuthor,
    });
    return { ok: true, moment, created: true };
  } catch (error) {
    if (!isClientIdConflict(error)) throw error;
    const winner = await db.moment.findUniqueOrThrow({
      where: { userId_clientId: { userId: input.userId, clientId: input.clientId } },
      ...momentWithAuthor,
    });
    return { ok: true, moment: winner, created: false };
  }
}

export function listMomentsInWindow(
  db: PrismaClient,
  lectureId: string,
  from: number,
  to: number,
  viewerId: string,
) {
  return db.moment.findMany({
    where: { lectureId, tSec: { gte: from, lte: to } },
    orderBy: [{ tSec: "asc" }, { createdAt: "asc" }],
    take: MAX_MOMENTS_PER_GET,
    ...forViewer(viewerId),
  });
}

export function listMomentsByIds(
  db: PrismaClient,
  lectureId: string,
  ids: string[],
  viewerId: string,
) {
  return db.moment.findMany({
    where: { lectureId, id: { in: ids } },
    ...forViewer(viewerId),
  });
}

export type MomentActionError = "not_found" | "own_moment" | "not_author" | "is_reply";

// Idempotent: voting twice or removing a missing vote changes nothing. The count changes in
// the same transaction as the Vote row, so it can't drift.
export async function setVote(
  db: PrismaClient,
  input: { momentId: string; lectureId: string; userId: string; on: boolean },
): Promise<
  { ok: true; moment: ViewerMomentRow; changed: boolean } | { ok: false; error: MomentActionError }
> {
  const moment = await db.moment.findFirst({
    where: { id: input.momentId, lectureId: input.lectureId },
    select: { userId: true },
  });
  if (!moment) return { ok: false, error: "not_found" };
  if (moment.userId === input.userId) return { ok: false, error: "own_moment" };

  const changed = await db.$transaction(async (tx) => {
    if (input.on) {
      const { count } = await tx.vote.createMany({
        data: [{ momentId: input.momentId, userId: input.userId }],
        skipDuplicates: true,
      });
      if (count === 1) {
        await tx.moment.update({
          where: { id: input.momentId },
          data: { upvotes: { increment: 1 } },
        });
      }
      return count === 1;
    }
    const { count } = await tx.vote.deleteMany({
      where: { momentId: input.momentId, userId: input.userId },
    });
    if (count === 1) {
      await tx.moment.update({
        where: { id: input.momentId },
        data: { upvotes: { decrement: 1 } },
      });
    }
    return count === 1;
  });

  const row = await db.moment.findUniqueOrThrow({
    where: { id: input.momentId },
    ...forViewer(input.userId),
  });
  return { ok: true, moment: row, changed };
}

// The asker marks their own doubt resolved or open again (Day 10 adds answerers and hosts).
export async function setResolved(
  db: PrismaClient,
  input: { momentId: string; lectureId: string; userId: string; resolved: boolean },
): Promise<
  { ok: true; moment: ViewerMomentRow; changed: boolean } | { ok: false; error: MomentActionError }
> {
  const moment = await db.moment.findFirst({
    where: { id: input.momentId, lectureId: input.lectureId },
    select: { userId: true, parentId: true, status: true },
  });
  if (!moment) return { ok: false, error: "not_found" };
  if (moment.parentId !== null) return { ok: false, error: "is_reply" };
  if (moment.userId !== input.userId) return { ok: false, error: "not_author" };

  const status = input.resolved ? MomentStatus.resolved : MomentStatus.open;
  const changed = moment.status !== status;
  if (changed) await db.moment.update({ where: { id: input.momentId }, data: { status } });
  const row = await db.moment.findUniqueOrThrow({
    where: { id: input.momentId },
    ...forViewer(input.userId),
  });
  return { ok: true, moment: row, changed };
}

export const MARKER_BUCKET_SEC = 15;
const MAX_MARKER_BUCKETS = 6000;

// Where doubts cluster across the whole lecture, in 15-second buckets (top-level doubts only).
export async function markerBuckets(
  db: PrismaClient,
  lectureId: string,
): Promise<{ tSec: number; count: number }[]> {
  const rows = await db.$queryRaw<{ tSec: number; count: number }[]>(Prisma.sql`
    SELECT ("tSec" / ${MARKER_BUCKET_SEC}) * ${MARKER_BUCKET_SEC} AS "tSec", COUNT(*)::int AS "count"
    FROM "moments"
    WHERE "lectureId" = ${lectureId} AND "parentId" IS NULL
    GROUP BY 1
    ORDER BY 1
    LIMIT ${MAX_MARKER_BUCKETS}
  `);
  return rows.map((row) => ({ tSec: Number(row.tSec), count: Number(row.count) }));
}

// `attempted: false` records a skipped send (no group yet), which doesn't use up a retry.
export async function recordSendResult(
  db: PrismaClient,
  momentId: string,
  result: { ok: true; messageId: string | null } | { ok: false; attempted: boolean },
) {
  await db.moment.update({
    where: { id: momentId },
    data: result.ok
      ? {
          sendStatus: SendStatus.sent,
          nexconnMessageId: result.messageId,
          sendAttempts: { increment: 1 },
        }
      : {
          sendStatus: SendStatus.failed,
          ...(result.attempted ? { sendAttempts: { increment: 1 } } : {}),
        },
  });
}

// Moments whose live signal hasn't gone out: failed ones at once, pending ones only once they
// are old enough that their first send is surely no longer in flight.
export function momentsToResend(db: PrismaClient, lectureId: string, now: Date, limit = 3) {
  return db.moment.findMany({
    where: {
      lectureId,
      sendAttempts: { lt: MAX_SEND_ATTEMPTS },
      OR: [
        { sendStatus: SendStatus.failed },
        {
          sendStatus: SendStatus.pending,
          createdAt: { lt: new Date(now.getTime() - 15_000) },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    ...momentWithAuthor,
  });
}
