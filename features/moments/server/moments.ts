import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { SendStatus } from "@/lib/generated/prisma/enums";
import { nexconnDisplayName } from "@/features/auth/shared/display-name";
import type { CreateMomentInput, MomentView } from "@/features/moments/shared/schemas";
import { MAX_MOMENTS_PER_GET } from "@/features/moments/shared/schemas";

export const MOMENT_CLIENT_INDEX = "moments_userId_clientId_key";
export const MAX_SEND_ATTEMPTS = 3;

const momentWithAuthor = {
  include: { user: { select: { name: true, nexconnUserId: true } } },
} satisfies Prisma.MomentDefaultArgs;

export type MomentRow = Prisma.MomentGetPayload<typeof momentWithAuthor>;

export function toMomentView(row: MomentRow, viewerId: string): MomentView {
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

  if (input.parentId) {
    // Replies stay one level deep and inside the same lecture.
    const parent = await db.moment.findFirst({
      where: { id: input.parentId, lectureId: input.lectureId, parentId: null },
      select: { id: true },
    });
    if (!parent) return { ok: false, error: "parent_not_found" };
  }

  try {
    const moment = await db.moment.create({
      data: {
        id: input.id,
        lectureId: input.lectureId,
        userId: input.userId,
        clientId: input.clientId,
        tSec: Math.floor(input.tSec),
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

export function listMomentsInWindow(db: PrismaClient, lectureId: string, from: number, to: number) {
  return db.moment.findMany({
    where: { lectureId, tSec: { gte: from, lte: to } },
    orderBy: [{ tSec: "asc" }, { createdAt: "asc" }],
    take: MAX_MOMENTS_PER_GET,
    ...momentWithAuthor,
  });
}

export function listMomentsByIds(db: PrismaClient, lectureId: string, ids: string[]) {
  return db.moment.findMany({
    where: { lectureId, id: { in: ids } },
    ...momentWithAuthor,
  });
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
