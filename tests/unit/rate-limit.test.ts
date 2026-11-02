import { describe, expect, it, vi } from "vitest";
import { createRateLimiter, RATE_LIMIT_SCRIPT, toDecision } from "@/lib/rate-limit";

const rule = { window: 60, max: 3 };

describe("toDecision", () => {
  it("allows up to and including max", () => {
    expect(toDecision(3, 50, rule)).toEqual({ allowed: true, retryAfter: null });
  });

  it("blocks above max and reports the remaining window", () => {
    expect(toDecision(4, 50, rule)).toEqual({ allowed: false, retryAfter: 50 });
  });

  it("never reports a retry time below one second", () => {
    expect(toDecision(4, -1, rule)).toEqual({ allowed: false, retryAfter: 1 });
  });
});

describe("createRateLimiter", () => {
  it("prefixes the key and passes the window", async () => {
    const evalFn = vi.fn(async () => [1, 60]);
    const consume = createRateLimiter(evalFn);
    await expect(consume("ml:x", rule)).resolves.toEqual({ allowed: true, retryAfter: null });
    expect(evalFn).toHaveBeenCalledWith(RATE_LIMIT_SCRIPT, 1, "rl:ml:x", 60);
  });

  it("fails closed when asked to, for limits that guard an external quota", async () => {
    const consume = createRateLimiter(
      async () => {
        throw new Error("ECONNREFUSED");
      },
      () => {},
      { failClosed: true },
    );
    await expect(consume("k", rule)).resolves.toEqual({ allowed: false, retryAfter: 60 });
  });

  it("fails open and reports the error when Redis is down", async () => {
    const onError = vi.fn();
    const consume = createRateLimiter(async () => {
      throw new Error("ECONNREFUSED");
    }, onError);
    await expect(consume("k", rule)).resolves.toEqual({ allowed: true, retryAfter: null });
    expect(onError).toHaveBeenCalledOnce();
  });
});
