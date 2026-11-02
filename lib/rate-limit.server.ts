import "server-only";
import { logger } from "@/lib/logger";
import { createRateLimiter } from "@/lib/rate-limit";
import { redis } from "@/lib/redis";

const evalScript = (script: string, numKeys: 1, key: string, window: number) =>
  redis.eval(script, numKeys, key, window);

export const consumeRate = createRateLimiter(evalScript, (error) =>
  logger.warn({ err: error }, "rate limiter unavailable, allowing request"),
);

// Denies when Redis is down: for limits that guard a quota we cannot get back.
export const consumeRateStrict = createRateLimiter(
  evalScript,
  (error) => logger.warn({ err: error }, "rate limiter unavailable, denying request"),
  { failClosed: true },
);
