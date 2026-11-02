import { z } from "zod";

export const MG = {
  Moment: "MG:Moment",
  MomentUpdate: "MG:MomentUpdate",
  Sync: "MG:Sync",
} as const;

export type MgMessageType = (typeof MG)[keyof typeof MG];

export const MAX_CONTENT_BYTES = 10 * 1024;
export const MAX_CUSTOM_TYPE_LENGTH = 32;

export const momentSchema = z.object({
  momentId: z.string().min(1),
  lectureId: z.string().min(1),
  tSec: z.number().nonnegative(),
  text: z.string().min(1).max(2000),
  parentId: z.string().nullable(),
});

// What the server sends to a lecture room (from marginbot): enough to show the doubt at once.
// A superset of momentSchema, so older decoders (the Day 2 lab) still read it.
export const roomMomentSchema = momentSchema.extend({
  authorName: z.string().min(1).max(64),
  clientId: z.string().max(64).nullable(),
  createdAt: z.string().max(40),
});

export const momentStatusSchema = z.enum(["open", "resolved"]);

export const momentUpdateSchema = z.object({
  momentId: z.string().min(1),
  upvotes: z.number().int().nonnegative(),
  status: momentStatusSchema,
  pinned: z.boolean(),
});

export const syncSchema = z.object({
  action: z.enum(["play", "pause", "seek", "heartbeat"]),
  tSec: z.number().nonnegative(),
  hostSentAt: z.number().int(),
});

export type MomentPayload = z.infer<typeof momentSchema>;
export type RoomMomentPayload = z.infer<typeof roomMomentSchema>;
export type MomentUpdatePayload = z.infer<typeof momentUpdateSchema>;
export type SyncPayload = z.infer<typeof syncSchema>;

export function isValidCustomType(messageType: string): boolean {
  return (
    messageType.length > 0 &&
    messageType.length <= MAX_CUSTOM_TYPE_LENGTH &&
    !messageType.startsWith("RC:") &&
    !messageType.startsWith("NC:")
  );
}

export function encodeContent(value: unknown): string {
  const json = JSON.stringify(value);
  if (new TextEncoder().encode(json).byteLength > MAX_CONTENT_BYTES) {
    throw new Error(`Message content exceeds ${MAX_CONTENT_BYTES} bytes`);
  }
  return json;
}

export function decodeContent<T>(schema: z.ZodType<T>, raw: unknown): T | null {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

const METADATA_KEY_RE = /^[A-Za-z0-9+=_-]{1,32}$/;
const METADATA_VALUE_MAX = 4096;

export function toMetadata(
  values: Record<string, string | number | boolean>,
): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!METADATA_KEY_RE.test(key)) throw new Error(`Invalid metadata key "${key}"`);
    const stringValue = typeof value === "boolean" ? (value ? "1" : "0") : String(value);
    if (stringValue.length > METADATA_VALUE_MAX)
      throw new Error(`Metadata value for "${key}" is too long`);
    metadata[key] = stringValue;
  }
  return metadata;
}

export function momentMetadata(
  update: Omit<MomentUpdatePayload, "momentId">,
): Record<string, string> {
  return toMetadata({ upvotes: update.upvotes, status: update.status, pinned: update.pinned });
}
