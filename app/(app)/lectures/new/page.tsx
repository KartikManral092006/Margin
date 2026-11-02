import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { verifySession } from "@/features/auth/server/session";
import { CreateRoomForm } from "@/features/lectures/components/create-room-form";
import { getVideoMeta } from "@/features/lectures/server";
import { findPublicByYoutubeId } from "@/features/lectures/server/lectures";
import { roomErrorMessage } from "@/features/lectures/shared/messages";
import { parseStartSec, thumbnailUrl, YOUTUBE_ID_RE } from "@/features/lectures/shared/youtube";
import { db } from "@/lib/db";

export const instant = false;

export const metadata: Metadata = {
  title: "Open a room · Margin",
  robots: { index: false, follow: false },
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Shown only to the first person to paste a video: confirm the video, then create the room.
export default async function NewLecturePage({ searchParams }: PageProps<"/lectures/new">) {
  await connection();
  const params = await searchParams;
  const videoId = first(params.v);
  if (!videoId || !YOUTUBE_ID_RE.test(videoId)) notFound();
  const startSec = parseStartSec(first(params.t));
  const query = `v=${videoId}${startSec ? `&t=${startSec}` : ""}`;

  await verifySession(`/lectures/new?${query}`);

  const existing = await findPublicByYoutubeId(db, videoId);
  if (existing) redirect(`/lectures/${existing.id}${startSec ? `?t=${startSec}` : ""}`);

  const meta = await getVideoMeta(videoId);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        {meta.ok ? (
          <>
            {/* Plain <img>: next/image would proxy YouTube thumbnails through our server. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnailUrl(videoId)}
              alt=""
              width={480}
              height={270}
              className="-mt-6 aspect-video w-full rounded-t-xl bg-muted object-cover"
            />
            <CardHeader>
              <CardTitle>
                <h1 className="line-clamp-3 text-lg font-semibold">{meta.meta.title}</h1>
              </CardTitle>
              <CardDescription>{meta.meta.channelName}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                No one has opened a room for this video yet. Open it and share the link with your
                class.
              </p>
              <CreateRoomForm videoId={videoId} startSec={startSec} />
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>
                <h1 className="text-lg font-semibold">Can&apos;t open this video</h1>
              </CardTitle>
              <CardDescription>{roomErrorMessage(meta.error)}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 sm:flex-row">
              {meta.error === "youtube_unavailable" && (
                <Button asChild className="h-11 flex-1">
                  <Link href={`/lectures/new?${query}`}>Try again</Link>
                </Button>
              )}
              <Button asChild variant="outline" className="h-11 flex-1">
                <Link href="/home">Paste another link</Link>
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
}
