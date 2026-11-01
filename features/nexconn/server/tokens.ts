import "server-only";
import { createHash } from "node:crypto";
import { issueAccessToken } from "@/features/nexconn/server/api";
import { getNexconn, nexconnPublicConfig } from "@/features/nexconn/server";
import { redis } from "@/lib/redis";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

function cacheKey(appKey: string, userId: string): string {
  const app = createHash("sha256").update(appKey).digest("hex").slice(0, 12);
  return `nexconn:token:v1:${app}:${userId}`;
}

export async function getChatToken(input: {
  userId: string;
  name: string;
  refresh?: boolean;
}): Promise<{ userId: string; accessToken: string }> {
  const key = cacheKey(nexconnPublicConfig().appKey, input.userId);

  if (!input.refresh) {
    const cached = await redis.get(key);
    if (cached) return { userId: input.userId, accessToken: cached };
  }

  const issued = await issueAccessToken(getNexconn(), { userId: input.userId, name: input.name });
  await redis.set(key, issued.accessToken, "EX", TOKEN_TTL_SECONDS);
  return { userId: issued.userId, accessToken: issued.accessToken };
}
