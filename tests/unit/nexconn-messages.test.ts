import { describe, expect, it } from "vitest";
import {
  decodeContent,
  encodeContent,
  isValidCustomType,
  MG,
  momentMetadata,
  momentSchema,
  toMetadata,
} from "@/features/nexconn/shared/messages";

const moment = {
  momentId: "m1",
  lectureId: "l1",
  tSec: 125,
  text: "What is a closure?",
  parentId: null,
};

describe("message types", () => {
  it("are valid custom types", () => {
    for (const type of Object.values(MG)) expect(isValidCustomType(type)).toBe(true);
  });

  it("rejects reserved prefixes and long names", () => {
    expect(isValidCustomType("RC:TxtMsg")).toBe(false);
    expect(isValidCustomType("NC:Foo")).toBe(false);
    expect(isValidCustomType("A".repeat(33))).toBe(false);
  });
});

describe("momentSchema", () => {
  it("accepts a valid moment and rejects a negative time", () => {
    expect(momentSchema.safeParse(moment).success).toBe(true);
    expect(momentSchema.safeParse({ ...moment, tSec: -1 }).success).toBe(false);
  });
});

describe("encodeContent", () => {
  it("serializes to JSON and rejects content over 10 KB", () => {
    expect(encodeContent(moment)).toBe(JSON.stringify(moment));
    expect(() => encodeContent({ text: "x".repeat(11 * 1024) })).toThrow();
  });

  it("counts bytes, not characters", () => {
    expect(() => encodeContent({ text: "क".repeat(4000) })).toThrow();
  });
});

describe("decodeContent", () => {
  it("accepts an object or a JSON string", () => {
    expect(decodeContent(momentSchema, moment)).toEqual(moment);
    expect(decodeContent(momentSchema, JSON.stringify(moment))).toEqual(moment);
  });

  it("returns null for invalid JSON or shape", () => {
    expect(decodeContent(momentSchema, "{not json")).toBeNull();
    expect(decodeContent(momentSchema, { momentId: "m1" })).toBeNull();
  });
});

describe("metadata", () => {
  it("stringifies values and encodes booleans as 1/0", () => {
    expect(momentMetadata({ upvotes: 3, status: "open", pinned: true })).toEqual({
      upvotes: "3",
      status: "open",
      pinned: "1",
    });
  });

  it("rejects keys outside the allowed charset", () => {
    expect(() => toMetadata({ "bad key": 1 })).toThrow();
    expect(() => toMetadata({ ["k".repeat(33)]: 1 })).toThrow();
  });
});
