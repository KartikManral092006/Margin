import { describe, expect, it } from "vitest";
import {
  DEFAULT_AFTER_SIGN_IN,
  isProtectedPath,
  safeCallbackPath,
  signInRedirectPath,
} from "@/features/auth/shared/routes";

describe("safeCallbackPath", () => {
  it.each([
    ["/home", "/home"],
    ["/home?x=1#t", "/home?x=1#t"],
    ["/a/../home", "/home"],
    ["/lectures/abc", "/lectures/abc"],
    ["/%0a", "/%0a"],
    ["/home/../home/x", "/home/x"],
    ["/open?v=dQw4w9WgXcQ&t=90", "/open?v=dQw4w9WgXcQ&t=90"],
  ])("keeps the same-origin path %s", (raw, expected) => {
    expect(safeCallbackPath(raw)).toBe(expected);
  });

  it.each([
    undefined,
    null,
    42,
    "",
    "home",
    "//evil.com",
    "//evil.com/home",
    "/.//evil.com",
    "/%2e%2e//evil.com",
    "/%2E//evil.com",
    "/home/..//evil.com/x",
    "/\\evil.com",
    "/\t/evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "/sign-in",
    "/sign-in?callbackURL=/x",
    "/api/auth/sign-out",
    `/${"a".repeat(600)}`,
  ])("falls back for %s", (raw) => {
    expect(safeCallbackPath(raw)).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it("uses the given fallback", () => {
    expect(safeCallbackPath("//evil.com", "/")).toBe("/");
  });
});

describe("signInRedirectPath", () => {
  it("encodes the return path as callbackURL", () => {
    expect(signInRedirectPath("/home?a=b")).toBe("/sign-in?callbackURL=%2Fhome%3Fa%3Db");
  });

  it("never carries an unsafe return path", () => {
    expect(signInRedirectPath("//evil.com")).toBe("/sign-in?callbackURL=%2Fhome");
  });
});

describe("isProtectedPath", () => {
  it("matches the prefix and its subpaths only", () => {
    expect(isProtectedPath("/home")).toBe(true);
    expect(isProtectedPath("/home/settings")).toBe(true);
    expect(isProtectedPath("/homework")).toBe(false);
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/sign-in")).toBe(false);
  });
});
