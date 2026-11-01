import { describe, expect, it } from "vitest";
import { isNexconnId, toNexconnId } from "@/features/nexconn/shared/ids";

describe("toNexconnId", () => {
  it("strips non-alphanumeric characters", () => {
    expect(toNexconnId("ckx-1_a")).toBe("ckx1a");
  });

  it("throws when the result is empty or too long", () => {
    expect(() => toNexconnId("---")).toThrow();
    expect(() => toNexconnId("a".repeat(65))).toThrow();
  });
});

describe("isNexconnId", () => {
  it("accepts letters and digits up to 64 characters", () => {
    expect(isNexconnId("devalice")).toBe(true);
    expect(isNexconnId("user_001")).toBe(false);
    expect(isNexconnId("a".repeat(64))).toBe(true);
  });
});
