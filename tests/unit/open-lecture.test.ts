import { describe, expect, it, vi } from "vitest";
import { openPublicLecture, type OpenDeps } from "@/features/lectures/server/open";
import type { PrismaClient } from "@/lib/generated/prisma/client";

const existing = { id: "E".repeat(32), youtubeId: "jNQXAC9IVRw" };

function deps(overrides: Partial<OpenDeps> & { found?: unknown } = {}) {
  const db = {
    lecture: { findFirst: vi.fn(async () => overrides.found ?? null) },
  } as unknown as PrismaClient;
  return {
    db,
    getMeta: vi.fn(async () => ({ ok: false as const, error: "video_not_found" as const })),
    consumeRate: vi.fn(async () => ({ allowed: true, retryAfter: null })),
    newId: () => "N".repeat(32),
    ...overrides,
  } satisfies OpenDeps;
}

describe("openPublicLecture", () => {
  it("opens an existing room without calling YouTube or spending the new-room limit", async () => {
    const d = deps({ found: existing });
    await expect(openPublicLecture(d, "u1", existing.youtubeId)).resolves.toEqual({
      ok: true,
      lecture: existing,
      created: false,
    });
    expect(d.getMeta).not.toHaveBeenCalled();
    expect(d.consumeRate).not.toHaveBeenCalled();
  });

  it("stops at the per-user new-room limit before calling YouTube", async () => {
    const d = deps({ consumeRate: vi.fn(async () => ({ allowed: false, retryAfter: 120 })) });
    await expect(openPublicLecture(d, "u1", "jNQXAC9IVRw")).resolves.toEqual({
      ok: false,
      error: "rate_limited",
      retryAfter: 120,
    });
    expect(d.consumeRate).toHaveBeenCalledWith("lec:new:u1", expect.anything());
    expect(d.getMeta).not.toHaveBeenCalled();
  });

  it("passes YouTube errors through", async () => {
    const d = deps();
    await expect(openPublicLecture(d, "u1", "jNQXAC9IVRw")).resolves.toEqual({
      ok: false,
      error: "video_not_found",
    });
  });
});
