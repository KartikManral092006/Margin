import Link from "next/link";
import type { LectureSummary } from "@/features/lectures/shared/schemas";
import { thumbnailUrl } from "@/features/lectures/shared/youtube";

export function LectureList({
  title,
  lectures,
  empty,
}: {
  title: string;
  lectures: LectureSummary[];
  empty: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {lectures.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {lectures.map((lecture) => (
            <li key={lecture.id}>
              <Link
                href={`/lectures/${lecture.id}`}
                className="flex gap-3 rounded-lg p-1 hover:bg-muted focus-visible:bg-muted"
              >
                {/* Plain <img>: next/image would proxy YouTube thumbnails through our server. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnailUrl(lecture.youtubeId)}
                  alt=""
                  loading="lazy"
                  width={128}
                  height={72}
                  className="aspect-video w-32 shrink-0 rounded-md bg-muted object-cover"
                />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="line-clamp-2 text-sm font-medium">{lecture.title}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {lecture.channelName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {lecture.memberCount} joined
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
