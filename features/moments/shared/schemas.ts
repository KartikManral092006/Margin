import { z } from "zod";

export const MOMENT_ID_RE = /^[A-Za-z0-9]{32}$/;
export const CLIENT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
export const MAX_BODY_CHARS = 1000;
export const MAX_T_SEC = 86_400;
// Widest window one GET may ask for (Day 6 fetches the window around the playhead).
export const MAX_WINDOW_SEC = 1800;
export const MAX_IDS_PER_GET = 20;
export const MAX_MOMENTS_PER_GET = 200;

const CONTROL_EXCEPT_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f]/g;

// Keeps line breaks (people paste code and formulas) but drops other control characters,
// runs of blank lines and surrounding whitespace.
export function normalizeBody(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_EXCEPT_NEWLINE, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const createMomentBody = z.strictObject({
  clientId: z.string().regex(CLIENT_ID_RE),
  tSec: z.number().finite().min(0).max(MAX_T_SEC),
  body: z
    .string()
    .max(MAX_BODY_CHARS * 4)
    .transform(normalizeBody)
    .refine((value) => value.length > 0, "empty")
    .refine((value) => Array.from(value).length <= MAX_BODY_CHARS, "too_long"),
  parentId: z.string().regex(MOMENT_ID_RE).nullable().optional(),
});

export type CreateMomentInput = z.infer<typeof createMomentBody>;

const intParam = z.coerce.number().int().min(0).max(MAX_T_SEC);

export const listMomentsQuery = z.union([
  z
    .object({
      ids: z
        .string()
        .min(1)
        .max(MAX_IDS_PER_GET * 33),
    })
    .transform(({ ids }) => ({ kind: "ids" as const, ids: ids.split(",") }))
    .refine(
      (q) => q.ids.length <= MAX_IDS_PER_GET && q.ids.every((id) => MOMENT_ID_RE.test(id)),
      "bad_ids",
    ),
  z
    .object({ from: intParam, to: intParam })
    .refine((q) => q.from <= q.to && q.to - q.from <= MAX_WINDOW_SEC, "bad_window")
    .transform((q) => ({ kind: "window" as const, from: q.from, to: q.to })),
]);

export type ListMomentsQuery = z.infer<typeof listMomentsQuery>;

// One shape for API responses and the client store.
export type MomentView = {
  id: string;
  lectureId: string;
  tSec: number;
  body: string;
  parentId: string | null;
  status: "open" | "resolved";
  upvotes: number;
  pinned: boolean;
  authorName: string;
  mine: boolean;
  // Lets the author's browser match its optimistic copy (a random per-doubt token).
  clientId: string | null;
  createdAt: string;
};
