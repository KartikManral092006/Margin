import { describe, expect, it } from "vitest";
import {
  createMomentBody,
  listMomentsQuery,
  MAX_BODY_CHARS,
  normalizeBody,
} from "@/features/moments/shared/schemas";

const ID = "a".repeat(32);
const valid = { clientId: "c12345678", tSec: 75.4, body: "Why is the loop O(n)?" };

describe("normalizeBody", () => {
  it("keeps single line breaks and trims", () => {
    expect(normalizeBody("  line one\nline two  ")).toBe("line one\nline two");
  });

  it("collapses runs of blank lines and Windows line endings", () => {
    expect(normalizeBody("a\r\n\r\n\r\n\r\nb")).toBe("a\n\nb");
  });

  it("replaces other control characters", () => {
    expect(normalizeBody("a\u0000b\tc")).toBe("a b c");
  });
});

describe("createMomentBody", () => {
  it("accepts a doubt and normalizes the text", () => {
    const parsed = createMomentBody.parse({ ...valid, body: "  hi\n\n\n\nthere " });
    expect(parsed.body).toBe("hi\n\nthere");
    expect(parsed.tSec).toBe(75.4);
  });

  it.each([
    ["an empty body", { ...valid, body: "   \n " }],
    ["a body over the limit", { ...valid, body: "x".repeat(MAX_BODY_CHARS + 1) }],
    ["a negative time", { ...valid, tSec: -1 }],
    ["a time past 24 h", { ...valid, tSec: 86_401 }],
    ["a bad clientId", { ...valid, clientId: "short" }],
    ["a bad parentId", { ...valid, parentId: "../x" }],
    ["unknown keys (the client can't set the author)", { ...valid, userId: "someone" }],
  ])("rejects %s", (_label, body) => {
    expect(createMomentBody.safeParse(body).success).toBe(false);
  });

  it("counts emoji as single characters", () => {
    expect(
      createMomentBody.safeParse({ ...valid, body: "😀".repeat(MAX_BODY_CHARS) }).success,
    ).toBe(true);
  });

  it("allows a reply to a moment", () => {
    expect(createMomentBody.parse({ ...valid, parentId: ID }).parentId).toBe(ID);
  });
});

describe("listMomentsQuery", () => {
  it("parses a window", () => {
    expect(listMomentsQuery.parse({ from: "0", to: "900" })).toEqual({
      kind: "window",
      from: 0,
      to: 900,
    });
  });

  it("parses a list of ids", () => {
    expect(listMomentsQuery.parse({ ids: `${ID},${"b".repeat(32)}` })).toEqual({
      kind: "ids",
      ids: [ID, "b".repeat(32)],
    });
  });

  it.each([
    [{ from: "100", to: "50" }],
    [{ from: "0", to: "5000" }],
    [{ from: "-5", to: "10" }],
    [{ ids: "../etc" }],
    [{ ids: Array.from({ length: 21 }, () => ID).join(",") }],
    [{}],
  ])("rejects %j", (query) => {
    expect(listMomentsQuery.safeParse(query).success).toBe(false);
  });
});
