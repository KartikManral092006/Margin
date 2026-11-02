import { describe, expect, it, vi } from "vitest";
import { fetchYouTubeMeta, oembedUrl } from "@/features/lectures/server/oembed";

const ID = "jNQXAC9IVRw";

function respond(status: number, body: string) {
  return vi.fn<typeof fetch>(async () => new Response(body, { status }));
}

describe("fetchYouTubeMeta", () => {
  it("asks YouTube's fixed endpoint for the canonical watch URL", async () => {
    const fetchImpl = respond(
      200,
      JSON.stringify({ title: "Me at the zoo", author_name: "jawed" }),
    );
    await fetchYouTubeMeta(ID, fetchImpl);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      `https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D${ID}`,
    );
    expect(oembedUrl(ID)).toBe(fetchImpl.mock.calls[0]?.[0]);
  });

  it("returns the title and channel", async () => {
    const fetchImpl = respond(
      200,
      JSON.stringify({ title: "Me at the zoo", author_name: "jawed" }),
    );
    await expect(fetchYouTubeMeta(ID, fetchImpl)).resolves.toEqual({
      ok: true,
      meta: { title: "Me at the zoo", channelName: "jawed" },
    });
  });

  it.each([
    [400, "video_not_found"],
    [404, "video_not_found"],
    [401, "video_unavailable"],
    [403, "video_unavailable"],
    [500, "youtube_unavailable"],
    [429, "youtube_unavailable"],
  ] as const)("maps HTTP %s to %s", async (status, error) => {
    await expect(fetchYouTubeMeta(ID, respond(status, "nope"))).resolves.toEqual({
      ok: false,
      error,
    });
  });

  it("treats a network failure or timeout as YouTube unavailable", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    await expect(fetchYouTubeMeta(ID, fetchImpl)).resolves.toEqual({
      ok: false,
      error: "youtube_unavailable",
    });
  });

  it.each([
    ["not json", "youtube_unavailable"],
    [JSON.stringify({ author_name: "x" }), "youtube_unavailable"],
    [JSON.stringify({ title: "   ", author_name: "x" }), "video_not_found"],
    [JSON.stringify({ title: "x".repeat(70_000), author_name: "x" }), "youtube_unavailable"],
  ])("rejects a bad body (%#)", async (body, error) => {
    await expect(fetchYouTubeMeta(ID, respond(200, body))).resolves.toEqual({ ok: false, error });
  });

  it("removes control characters and caps the length", async () => {
    const title = `Line\none\u0000${"a".repeat(400)}`;
    const result = await fetchYouTubeMeta(
      ID,
      respond(200, JSON.stringify({ title, author_name: "ch\tannel" })),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meta.title.startsWith("Line one a")).toBe(true);
    expect(Array.from(result.meta.title)).toHaveLength(300);
    expect(result.meta.channelName).toBe("ch annel");
  });

  it("never calls YouTube for an invalid ID", async () => {
    const fetchImpl = respond(200, "{}");
    await expect(fetchYouTubeMeta("../../x", fetchImpl)).resolves.toEqual({
      ok: false,
      error: "video_not_found",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
