import { describe, expect, it } from "vitest";
import { decideTokenIdentity, tokenRequestSchema } from "@/features/nexconn/shared/token-request";

const user = { id: "u1AbC", name: "Kartik", nexconnUserId: "u1AbC" };

describe("tokenRequestSchema", () => {
  it("rejects a body that names a user", () => {
    expect(tokenRequestSchema.safeParse({ userId: "someone", name: "x" }).success).toBe(false);
  });

  it("rejects unknown dev users", () => {
    expect(tokenRequestSchema.safeParse({ devUser: "marginbot" }).success).toBe(false);
  });

  it("accepts an empty body and a refresh flag", () => {
    expect(tokenRequestSchema.safeParse({}).success).toBe(true);
    expect(tokenRequestSchema.safeParse({ refresh: true, devUser: "devbob" }).success).toBe(true);
  });
});

describe("decideTokenIdentity", () => {
  it("hides dev users when dev routes are off", () => {
    expect(
      decideTokenIdentity({ devUser: "devalice", devRoutesEnabled: false, sessionUser: user }),
    ).toEqual({ ok: false, status: 404, error: "not_found" });
  });

  it("uses the dev user when dev routes are on", () => {
    expect(
      decideTokenIdentity({ devUser: "devalice", devRoutesEnabled: true, sessionUser: null }),
    ).toEqual({ ok: true, userId: "devalice", name: "devalice", backfill: false });
  });

  it("requires a session otherwise", () => {
    expect(decideTokenIdentity({ devRoutesEnabled: true, sessionUser: null })).toEqual({
      ok: false,
      status: 401,
      error: "unauthenticated",
    });
  });

  it("uses the session user's Nexconn ID and name", () => {
    expect(decideTokenIdentity({ devRoutesEnabled: false, sessionUser: user })).toEqual({
      ok: true,
      userId: "u1AbC",
      name: "Kartik",
      backfill: false,
    });
  });

  it("derives and backfills a missing Nexconn ID", () => {
    const result = decideTokenIdentity({
      devRoutesEnabled: false,
      sessionUser: { ...user, name: "", nexconnUserId: null },
    });
    expect(result).toEqual({ ok: true, userId: "u1AbC", name: "Learner 1ABC", backfill: true });
  });
});
