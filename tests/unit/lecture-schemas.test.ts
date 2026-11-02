import { describe, expect, it } from "vitest";
import {
  escapeLike,
  LECTURE_ID_RE,
  listLecturesQuery,
  openLectureBody,
} from "@/features/lectures/shared/schemas";
import { roomErrorMessage } from "@/features/lectures/shared/messages";

describe("openLectureBody", () => {
  it("accepts a URL and an optional visibility", () => {
    expect(openLectureBody.safeParse({ url: "https://youtu.be/x" }).success).toBe(true);
    expect(openLectureBody.safeParse({ url: "x", visibility: "private" }).success).toBe(true);
  });

  it("rejects unknown keys, so the client can't set the title or owner", () => {
    expect(openLectureBody.safeParse({ url: "x", title: "Mine" }).success).toBe(false);
  });

  it("rejects an empty or oversized URL", () => {
    expect(openLectureBody.safeParse({ url: "" }).success).toBe(false);
    expect(openLectureBody.safeParse({ url: "x".repeat(2049) }).success).toBe(false);
  });
});

describe("listLecturesQuery", () => {
  it("defaults to recent with no search", () => {
    expect(listLecturesQuery.parse({})).toEqual({ q: undefined, sort: "recent" });
  });

  it("turns a blank search into no search", () => {
    expect(listLecturesQuery.parse({ q: "   " }).q).toBeUndefined();
  });

  it("caps the search and the sort values", () => {
    expect(listLecturesQuery.safeParse({ q: "a".repeat(101) }).success).toBe(false);
    expect(listLecturesQuery.safeParse({ sort: "oldest" }).success).toBe(false);
  });
});

describe("escapeLike", () => {
  it.each([
    ["s_s", "s\\_s"],
    ["100%", "100\\%"],
    ["a\\b", "a\\\\b"],
    ["plain", "plain"],
  ])("%s -> %s", (input, expected) => {
    expect(escapeLike(input)).toBe(expected);
  });
});

describe("LECTURE_ID_RE", () => {
  it("only accepts 32 letters and digits", () => {
    expect(LECTURE_ID_RE.test("a".repeat(32))).toBe(true);
    expect(LECTURE_ID_RE.test("a".repeat(31))).toBe(false);
    expect(LECTURE_ID_RE.test(`${"a".repeat(31)}-`)).toBe(false);
  });
});

describe("roomErrorMessage", () => {
  it("maps known codes and falls back for unknown ones", () => {
    expect(roomErrorMessage("video_unavailable")).toMatch(/private/);
    expect(roomErrorMessage("other")).toMatch(/Something went wrong/);
    expect(roomErrorMessage(null)).toBeNull();
  });
});
