import { z } from "zod";

export const LECTURE_ID_RE = /^[A-Za-z0-9]{32}$/;

export const openLectureBody = z.strictObject({
  url: z.string().min(1).max(2048),
  // Accepted so the route can answer "not yet" explicitly instead of a generic 400.
  visibility: z.enum(["public", "private"]).optional(),
});

export const listLecturesQuery = z.object({
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => (value ? value : undefined)),
  sort: z.enum(["recent", "popular"]).default("recent"),
});

export type ListLecturesQuery = z.infer<typeof listLecturesQuery>;

// Prisma's `contains` passes %, _ and \ through to ILIKE unescaped.
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export type LectureSummary = {
  id: string;
  youtubeId: string;
  title: string;
  channelName: string;
  durationSec: number | null;
  memberCount: number;
  createdAt: string;
};
