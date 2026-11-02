import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROTECTED_PREFIXES } from "@/features/auth/shared/routes";
import { config, proxy } from "@/proxy";

const base = "http://localhost:3000";

function matches(path: string): boolean {
  return unstable_doesMiddlewareMatch({ config, url: `${base}${path}` });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy matcher", () => {
  it.each(PROTECTED_PREFIXES.flatMap((prefix) => [prefix, `${prefix}/nested`]))(
    "covers protected path %s",
    (path) => {
      expect(matches(path)).toBe(true);
    },
  );

  it("leaves auth routes and the landing page alone", () => {
    expect(matches("/api/auth/callback/google")).toBe(false);
    expect(matches("/sign-in")).toBe(false);
    expect(matches("/")).toBe(false);
  });

  it("leaves the paste entry point and the lecture API to their own checks", () => {
    expect(matches("/open")).toBe(false);
    expect(matches("/api/lectures")).toBe(false);
    expect(matches("/lecturesx")).toBe(false);
  });
});

describe("proxy", () => {
  it("redirects a signed-out visitor to sign-in with a callbackURL", () => {
    const response = proxy(new NextRequest(`${base}/home?tab=1`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${base}/sign-in?callbackURL=%2Fhome%3Ftab%3D1`);
  });

  it("sends a signed-out visitor of a room back to it after sign-in", () => {
    const response = proxy(new NextRequest(`${base}/lectures/${"a".repeat(32)}?t=90`));
    expect(response.headers.get("location")).toBe(
      `${base}/sign-in?callbackURL=%2Flectures%2F${"a".repeat(32)}%3Ft%3D90`,
    );
  });

  it.each(["better-auth.session_token", "__Secure-better-auth.session_token"])(
    "lets a request with the %s cookie through",
    (cookie) => {
      const response = proxy(
        new NextRequest(`${base}/home`, { headers: { cookie: `${cookie}=x` } }),
      );
      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );

  it("hides dev routes unless they are enabled", () => {
    vi.stubEnv("NEXCONN_DEV_ROUTES", "0");
    expect(proxy(new NextRequest(`${base}/dev/nexconn`)).status).toBe(404);
    vi.stubEnv("NEXCONN_DEV_ROUTES", "1");
    vi.stubEnv("NODE_ENV", "development");
    expect(proxy(new NextRequest(`${base}/dev/nexconn`)).status).not.toBe(404);
  });
});
