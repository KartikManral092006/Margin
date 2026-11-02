export type RateRule = { window: number; max: number };
export type RateDecision = { allowed: boolean; retryAfter: number | null };

// Fixed window: the first hit sets the expiry, later hits only count.
export const RATE_LIMIT_SCRIPT =
  "local c = redis.call('INCR', KEYS[1]) " +
  "if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end " +
  "return {c, redis.call('TTL', KEYS[1])}";

export type EvalFn = (script: string, numKeys: 1, key: string, window: number) => Promise<unknown>;

export function toDecision(count: number, ttl: number, rule: RateRule): RateDecision {
  if (count <= rule.max) return { allowed: true, retryAfter: null };
  return { allowed: false, retryAfter: Math.max(ttl, 1) };
}

// Fails open when Redis is unavailable so sign-in keeps working; onError lets the caller log it.
export function createRateLimiter(evalFn: EvalFn, onError: (error: unknown) => void = () => {}) {
  return async function consume(key: string, rule: RateRule): Promise<RateDecision> {
    try {
      const [count, ttl] = (await evalFn(RATE_LIMIT_SCRIPT, 1, `rl:${key}`, rule.window)) as [
        number,
        number,
      ];
      return toDecision(count, ttl, rule);
    } catch (error) {
      onError(error);
      return { allowed: true, retryAfter: null };
    }
  };
}
