import { Prisma, type Lecture, type PrismaClient } from "@/lib/generated/prisma/client";
import { Role, Visibility } from "@/lib/generated/prisma/enums";
import type { VideoMeta } from "@/features/lectures/server/oembed";
import {
  escapeLike,
  type LectureSummary,
  type ListLecturesQuery,
} from "@/features/lectures/shared/schemas";
import { toNexconnId } from "@/features/nexconn/shared/ids";

export const PUBLIC_YOUTUBE_INDEX = "lectures_public_youtubeId_key";
const LIST_LIMIT = 20;

// Under PrismaPg a unique violation is P2002 with the index name in
// meta.driverAdapterError.cause.constraint.index (there is no meta.target).
export function isUniqueViolation(error: unknown, index: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const meta = error.meta as
    { driverAdapterError?: { cause?: { constraint?: { index?: string } } } } | undefined;
  return meta?.driverAdapterError?.cause?.constraint?.index === index;
}

export function lectureChannelId(lectureId: string): string {
  return toNexconnId(`lec${lectureId}`);
}

export function toSummary(lecture: Lecture): LectureSummary {
  return {
    id: lecture.id,
    youtubeId: lecture.youtubeId,
    title: lecture.title,
    channelName: lecture.channelName,
    durationSec: lecture.durationSec,
    memberCount: lecture.memberCount,
    createdAt: lecture.createdAt.toISOString(),
  };
}

// Never findUnique by youtubeId: the unique index is partial and Prisma drops the predicate.
export function findPublicByYoutubeId(db: PrismaClient, youtubeId: string) {
  return db.lecture.findFirst({ where: { youtubeId, visibility: Visibility.public } });
}

// Two people pasting the same video at once both end up in one room: the loser's insert hits
// the partial unique index (P2002) and then reads the committed winner.
export async function findOrCreatePublicLecture(
  db: PrismaClient,
  input: { youtubeId: string; meta: VideoMeta; userId: string; newId: () => string },
): Promise<{ lecture: Lecture; created: boolean }> {
  const existing = await findPublicByYoutubeId(db, input.youtubeId);
  if (existing) return { lecture: existing, created: false };

  const id = input.newId();
  try {
    const lecture = await db.$transaction(async (tx) => {
      const created = await tx.lecture.create({
        data: {
          id,
          youtubeId: input.youtubeId,
          title: input.meta.title,
          channelName: input.meta.channelName,
          nexconnChannelId: lectureChannelId(id),
          createdById: input.userId,
          memberCount: 1,
        },
      });
      await tx.lectureMembership.create({
        data: { lectureId: created.id, userId: input.userId, role: Role.member },
      });
      return created;
    });
    return { lecture, created: true };
  } catch (error) {
    // Caught outside the transaction: inside it, Postgres has already aborted the tx.
    if (!isUniqueViolation(error, PUBLIC_YOUTUBE_INDEX)) throw error;
    const winner = await db.lecture.findFirstOrThrow({
      where: { youtubeId: input.youtubeId, visibility: Visibility.public },
    });
    return { lecture: winner, created: false };
  }
}

export async function joinLecture(
  db: PrismaClient,
  lectureId: string,
  userId: string,
): Promise<{ joinedNow: boolean; memberCount: number; role: Role }> {
  return db.$transaction(async (tx) => {
    const { count } = await tx.lectureMembership.createMany({
      data: [{ lectureId, userId, role: Role.member }],
      skipDuplicates: true,
    });
    const lecture =
      count === 1
        ? await tx.lecture.update({
            where: { id: lectureId },
            data: { memberCount: { increment: 1 } },
            select: { memberCount: true },
          })
        : await tx.lecture.findUniqueOrThrow({
            where: { id: lectureId },
            select: { memberCount: true },
          });
    const membership = await tx.lectureMembership.findUniqueOrThrow({
      where: { lectureId_userId: { lectureId, userId } },
      select: { role: true },
    });
    return { joinedNow: count === 1, memberCount: lecture.memberCount, role: membership.role };
  });
}

export function listPublicLectures(
  db: PrismaClient,
  query: { q?: string; sort: ListLecturesQuery["sort"] },
  take: number = LIST_LIMIT,
) {
  return db.lecture.findMany({
    where: {
      visibility: Visibility.public,
      ...(query.q
        ? { title: { contains: escapeLike(query.q), mode: "insensitive" as const } }
        : {}),
    },
    orderBy:
      query.sort === "popular"
        ? [{ memberCount: "desc" }, { createdAt: "desc" }]
        : [{ createdAt: "desc" }],
    take,
  });
}

// Null for missing and non-public rooms alike, so private rooms cannot be probed.
export async function getLectureForViewer(db: PrismaClient, lectureId: string, userId: string) {
  const lecture = await db.lecture.findFirst({
    where: { id: lectureId, visibility: Visibility.public },
  });
  if (!lecture) return null;
  const membership = await db.lectureMembership.findUnique({
    where: { lectureId_userId: { lectureId, userId } },
    select: { role: true, nexconnJoinedAt: true },
  });
  return { lecture, membership };
}
