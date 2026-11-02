import "server-only";
import { logger } from "@/lib/logger";
import { createRateLimiter } from "@/lib/rate-limit";
import { redis } from "@/lib/redis";

export const consumeRate = createRateLimiter(
  (script, numKeys, key, window) => redis.eval(script, numKeys, key, window),
  (error) => logger.warn({ err: error }, "rate limiter unavailable, allowing request"),
);
