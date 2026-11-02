import { describe, expect, it } from "vitest";
import {
  isUniqueViolation,
  lectureChannelId,
  PUBLIC_YOUTUBE_INDEX,
} from "@/features/lectures/server/lectures";
import { Prisma } from "@/lib/generated/prisma/client";
import { NEXCONN_ID_RE } from "@/features/nexconn/shared/ids";

function knownError(code: string, index?: string) {
  return new Prisma.PrismaClientKnownRequestError("x", {
    code,
    clientVersion: "7.10.1",
    meta: index ? { driverAdapterError: { cause: { constraint: { index } } } } : undefined,
  });
}

describe("isUniqueViolation", () => {
  it("matches P2002 on the public youtubeId index", () => {
    expect(isUniqueViolation(knownError("P2002", PUBLIC_YOUTUBE_INDEX), PUBLIC_YOUTUBE_INDEX)).toBe(
      true,
    );
  });

  it("ignores other indexes, other codes and plain errors", () => {
    expect(isUniqueViolation(knownError("P2002", "other_key"), PUBLIC_YOUTUBE_INDEX)).toBe(false);
    expect(isUniqueViolation(knownError("P2003", PUBLIC_YOUTUBE_INDEX), PUBLIC_YOUTUBE_INDEX)).toBe(
      false,
    );
    expect(isUniqueViolation(knownError("P2002"), PUBLIC_YOUTUBE_INDEX)).toBe(false);
    expect(isUniqueViolation(new Error("P2002"), PUBLIC_YOUTUBE_INDEX)).toBe(false);
  });
});

describe("lectureChannelId", () => {
  it("is a valid Nexconn ID", () => {
    const id = lectureChannelId("a".repeat(32));
    expect(id).toBe(`lec${"a".repeat(32)}`);
    expect(id).toMatch(NEXCONN_ID_RE);
  });
});
