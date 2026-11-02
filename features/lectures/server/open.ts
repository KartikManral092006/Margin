import type { Lecture, PrismaClient } from "@/lib/generated/prisma/client";
import {
  findOrCreatePublicLecture,
  findPublicByYoutubeId,
} from "@/features/lectures/server/lectures";
import type { MetaError, MetaResult } from "@/features/lectures/server/oembed";
import type { RateDecision, RateRule } from "@/lib/rate-limit";

// New rooms cost an oEmbed call and, later, a Nexconn group. Opening an existing room is free.
export const NEW_ROOMS_PER_USER = { window: 86_400, max: 20 } satisfies RateRule;
export const NEW_ROOMS_TOTAL = { window: 86_400, max: 500 } satisfies RateRule;

export type OpenDeps = {
  db: PrismaClient;
  getMeta: (videoId: string) => Promise<MetaResult>;
  consumeRate: (key: string, rule: RateRule) => Promise<RateDecision>;
  newId: () => string;
};

export type OpenResult =
  | { ok: true; lecture: Lecture; created: boolean }
  | { ok: false; error: "rate_limited"; retryAfter: number }
  | { ok: false; error: MetaError };

export async function openPublicLecture(
  deps: OpenDeps,
  userId: string,
  videoId: string,
): Promise<OpenResult> {
  const existing = await findPublicByYoutubeId(deps.db, videoId);
  if (existing) return { ok: true, lecture: existing, created: false };

  for (const [key, rule] of [
    [`lec:new:${userId}`, NEW_ROOMS_PER_USER],
    ["lec:new:all", NEW_ROOMS_TOTAL],
  ] as const) {
    const decision = await deps.consumeRate(key, rule);
    if (!decision.allowed) {
      return { ok: false, error: "rate_limited", retryAfter: decision.retryAfter ?? rule.window };
    }
  }

  // Network call stays outside any transaction.
  const meta = await deps.getMeta(videoId);
  if (!meta.ok) return { ok: false, error: meta.error };

  const result = await findOrCreatePublicLecture(deps.db, {
    youtubeId: videoId,
    meta: meta.meta,
    userId,
    newId: deps.newId,
  });
  return { ok: true, ...result };
}
