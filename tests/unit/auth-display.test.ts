import { describe, expect, it } from "vitest";
import { nexconnDisplayName } from "@/features/auth/shared/display-name";
import { maskEmail, signInErrorMessage } from "@/features/auth/shared/errors";

describe("nexconnDisplayName", () => {
  it("collapses whitespace", () => {
    expect(nexconnDisplayName({ name: "  Kartik \n  Manral ", nexconnUserId: "abc" })).toBe(
      "Kartik Manral",
    );
  });

  it("caps the name at 64 characters without splitting an emoji", () => {
    const name = "😀".repeat(70);
    const result = nexconnDisplayName({ name, nexconnUserId: "abc" });
    expect(Array.from(result)).toHaveLength(64);
    expect(result).toBe("😀".repeat(64));
  });

  it("falls back to a neutral label, never the email", () => {
    const result = nexconnDisplayName({ name: "   ", nexconnUserId: "AbCdEf12wxyz" });
    expect(result).toBe("Learner WXYZ");
    expect(result).not.toContain("@");
  });
});

describe("signInErrorMessage", () => {
  it("returns null without a code", () => {
    expect(signInErrorMessage(undefined)).toBeNull();
    expect(signInErrorMessage("")).toBeNull();
  });

  it("explains an expired or reused link", () => {
    expect(signInErrorMessage("INVALID_TOKEN")).toMatch(/expired or was already used/);
  });

  it("suggests Google only when the Google button is shown", () => {
    expect(signInErrorMessage("EMAIL_QUOTA")).not.toMatch(/Google/);
    expect(signInErrorMessage("EMAIL_QUOTA", { google: true })).toMatch(/continue with Google/);
    expect(signInErrorMessage("INVALID_TOKEN", { google: true })).not.toMatch(/Google/);
  });

  it("uses a generic message for unknown codes", () => {
    expect(signInErrorMessage("SOMETHING_ELSE")).toMatch(/Something went wrong/);
  });
});

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmail("kartik@gehu.ac.in")).toBe("k***@gehu.ac.in");
  });

  it("hides malformed input entirely", () => {
    expect(maskEmail("no-at-sign")).toBe("***");
  });
});
