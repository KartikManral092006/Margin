import { describe, expect, it } from "vitest";
import { isSameOriginNavigation, toConfirmUrl } from "@/features/auth/shared/magic-link";

const origin = "http://localhost:3000";

describe("toConfirmUrl", () => {
  it("points the emailed link at the confirm page and keeps the query", () => {
    expect(toConfirmUrl(`${origin}/api/auth/magic-link/verify?token=abc&callbackURL=%2Fhome`)).toBe(
      `${origin}/sign-in/confirm?token=abc&callbackURL=%2Fhome`,
    );
  });
});

describe("isSameOriginNavigation", () => {
  const headers = (init: Record<string, string>) => new Headers(init);

  it("accepts a submit from our own page", () => {
    expect(isSameOriginNavigation(headers({ "sec-fetch-site": "same-origin" }), origin)).toBe(true);
  });

  it.each(["none", "cross-site", "same-site"])("rejects sec-fetch-site %s", (site) => {
    expect(isSameOriginNavigation(headers({ "sec-fetch-site": site }), origin)).toBe(false);
  });

  it("does not let a same-origin Referer override Fetch Metadata", () => {
    expect(
      isSameOriginNavigation(
        headers({ "sec-fetch-site": "cross-site", referer: `${origin}/sign-in/confirm` }),
        origin,
      ),
    ).toBe(false);
  });

  it("falls back to the Referer for browsers without Fetch Metadata", () => {
    expect(isSameOriginNavigation(headers({ referer: `${origin}/sign-in/confirm` }), origin)).toBe(
      true,
    );
    expect(isSameOriginNavigation(headers({ referer: "https://evil.example/" }), origin)).toBe(
      false,
    );
  });

  it("rejects scanners that send neither header", () => {
    expect(isSameOriginNavigation(headers({}), origin)).toBe(false);
  });
});
