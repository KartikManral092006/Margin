import { describe, expect, it } from "vitest";
import { newUserId } from "@/features/auth/shared/ids";
import { NEXCONN_ID_RE } from "@/features/nexconn/shared/ids";

describe("newUserId", () => {
  it("returns 32 letters and digits, valid as a Nexconn user ID", () => {
    const id = newUserId();
    expect(id).toHaveLength(32);
    expect(id).toMatch(NEXCONN_ID_RE);
  });

  it("does not repeat across many IDs", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newUserId()));
    expect(ids.size).toBe(1000);
  });

  it("skips bytes that would bias the alphabet", () => {
    const bytes = new Uint8Array([255, 248, 0, 61, 62]);
    expect(newUserId(3, () => bytes)).toBe("A9A");
  });
});
