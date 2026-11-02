import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { verifySession } from "@/features/auth/server/session";
import { RoomClient } from "@/features/lectures/components/room-client";
import { getLectureForViewer, toSummary } from "@/features/lectures/server/lectures";
import { LECTURE_ID_RE } from "@/features/lectures/shared/schemas";
import { parseStartSec } from "@/features/lectures/shared/youtube";
import { Visibility } from "@/lib/generated/prisma/enums";
import { db } from "@/lib/db";

export const instant = false;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const publicTitle = cache(async (id: string): Promise<string | null> => {
  if (!LECTURE_ID_RE.test(id)) return null;
  const lecture = await db.lecture.findFirst({
    where: { id, visibility: Visibility.public },
    select: { title: true },
  });
  return lecture?.title ?? null;
});

export async function generateMetadata({ params }: PageProps<"/lectures/[id]">): Promise<Metadata> {
  await connection();
  const title = await publicTitle((await params).id);
  return {
    title: title ? `${title} · Margin` : "Lecture · Margin",
    robots: { index: false, follow: false },
  };
}

export default async function LecturePage({ params, searchParams }: PageProps<"/lectures/[id]">) {
  await connection();
  const { id } = await params;
  if (!LECTURE_ID_RE.test(id)) notFound();

  const startSec = parseStartSec(first((await searchParams).t));
  const user = await verifySession(`/lectures/${id}${startSec ? `?t=${startSec}` : ""}`);
  const viewer = await getLectureForViewer(db, id, user.id);
  if (!viewer) notFound();

  return <RoomClient key={id} lecture={toSummary(viewer.lecture)} startSec={startSec} />;
}
