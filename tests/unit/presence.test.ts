import { describe, expect, it } from "vitest";
import {
  buildSnapshot,
  describeOthers,
  heartbeatBody,
  MAX_NAMES_PER_WINDOW,
  othersHere,
  presenceWindow,
  type PresenceEntry,
} from "@/features/presence/shared/presence";

const entry = (userId: string, tSec: number, name = userId): PresenceEntry => ({
  userId,
  name,
  tSec,
  playing: true,
});

describe("presenceWindow", () => {
  it.each([
    [0, 0],
    [29.9, 0],
    [30, 1],
    [1800, 60],
    [-5, 0],
  ])("%s s -> window %s", (tSec, window) => {
    expect(presenceWindow(tSec)).toBe(window);
  });
});

describe("buildSnapshot", () => {
  it("groups viewers by 30-second window and never includes the viewer", () => {
    const snapshot = buildSnapshot(
      [
        entry("me", 10, "Viewer Self"),
        entry("ana", 12, "Ana"),
        entry("ravi", 25, "Ravi"),
        entry("zoe", 95, "Zoe"),
      ],
      "me",
    );
    expect(snapshot.total).toBe(3);
    expect(snapshot.windows).toEqual({
      "0": { count: 2, names: ["Ana", "Ravi"] },
      "3": { count: 1, names: ["Zoe"] },
    });
    expect(JSON.stringify(snapshot)).not.toContain("Viewer Self");
  });

  it("caps the names per window but counts everyone", () => {
    const entries = Array.from({ length: 10 }, (_, i) => entry(`u${i}`, 40, `User ${i}`));
    const window = buildSnapshot(entries, "me").windows["1"];
    expect(window?.count).toBe(10);
    expect(window?.names).toHaveLength(MAX_NAMES_PER_WINDOW);
  });

  it("sends no user ids, only display names", () => {
    const snapshot = buildSnapshot([entry("SECRETID123", 5, "Ana")], "me");
    expect(JSON.stringify(snapshot)).not.toContain("SECRETID123");
  });
});

describe("othersHere and describeOthers", () => {
  const snapshot = buildSnapshot(
    [entry("a", 61, "Ana"), entry("b", 70, "Ravi"), entry("c", 80, "Sam"), entry("d", 85, "Tia")],
    "me",
  );

  it("finds the people at my window", () => {
    expect(othersHere(snapshot, 75)).toEqual({ count: 4, names: ["Ana", "Ravi", "Sam", "Tia"] });
    expect(othersHere(snapshot, 5)).toEqual({ count: 0, names: [] });
    expect(othersHere(null, 5)).toEqual({ count: 0, names: [] });
  });

  it.each([
    [{ count: 0, names: [] }, "Nobody else is at this moment right now"],
    [{ count: 1, names: ["Ana"] }, "Ana is here"],
    [{ count: 2, names: ["Ana", "Ravi"] }, "Ana and Ravi are here"],
    [{ count: 3, names: ["Ana", "Ravi", "Sam"] }, "Ana, Ravi and 1 other are here"],
    [{ count: 9, names: ["Ana", "Ravi"] }, "Ana, Ravi and 7 others are here"],
    [{ count: 1, names: [] }, "1 person is here"],
  ])("%j -> %s", (others, text) => {
    expect(describeOthers(others)).toBe(text);
  });
});

describe("heartbeatBody", () => {
  it("accepts a position and refuses junk", () => {
    expect(heartbeatBody.safeParse({ tSec: 12.5, playing: true }).success).toBe(true);
    expect(heartbeatBody.safeParse({ tSec: -1, playing: true }).success).toBe(false);
    expect(heartbeatBody.safeParse({ tSec: 1, playing: true, userId: "x" }).success).toBe(false);
  });
});
