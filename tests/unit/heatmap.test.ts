import { describe, expect, it } from "vitest";
import {
  adjustBucket,
  heatLevels,
  hottestStretch,
  lostBody,
  lostBucket,
  MIN_PEOPLE_SHOWN,
  publicHeatmap,
  withMine,
} from "@/features/heatmap/shared/heatmap";
import { isLetterShortcut, type KeyEventInfo } from "@/lib/shortcuts";

describe("lostBucket", () => {
  it.each([
    [0, 0],
    [14.99, 0],
    [15, 1],
    [29.9, 1],
    [750, 50],
    [-3, 0], // clamped
    [10e6, 5760], // clamped to 24 h
  ])("%s s -> bucket %s", (tSec, bucket) => {
    expect(lostBucket(tSec)).toBe(bucket);
  });

  it("accepts only a finite time within a day", () => {
    expect(lostBody.safeParse({ tSec: 12.5 }).success).toBe(true);
    for (const bad of [{ tSec: -1 }, { tSec: 86_401 }, { tSec: "5" }, {}, { tSec: 1, x: 1 }]) {
      expect(lostBody.safeParse(bad).success).toBe(false);
    }
    expect(lostBody.safeParse({ tSec: Number.NaN }).success).toBe(false);
  });
});

describe("heatLevels", () => {
  it("scales by the square root of the share of the busiest bucket", () => {
    const levels = heatLevels(
      [
        { bucket: 4, count: 4 },
        { bucket: 1, count: 1 },
      ],
      600,
    );
    expect(levels).toEqual([
      { startSec: 15, endSec: 30, count: 1, level: 0.5 },
      { startSec: 60, endSec: 75, count: 4, level: 1 },
    ]);
  });

  it("drops buckets past the end and clips the last one", () => {
    const levels = heatLevels(
      [
        { bucket: 3, count: 2 },
        { bucket: 9, count: 5 }, // starts at 135 s, after the 50 s video
      ],
      50,
    );
    expect(levels).toEqual([{ startSec: 45, endSec: 50, count: 2, level: 1 }]);
  });

  it("groups a long lecture into at most 90 bins, each showing its busiest bucket", () => {
    // 60 minutes / 90 bins = 40 s, rounded up to whole buckets: 45 s bins.
    const levels = heatLevels(
      [
        { bucket: 0, count: 1 },
        { bucket: 1, count: 3 }, // same 0-45 s bin as bucket 0
        { bucket: 3, count: 6 }, // 45-90 s bin
      ],
      3600,
    );
    expect(levels).toEqual([
      { startSec: 0, endSec: 45, count: 3, level: Math.sqrt(0.5) },
      { startSec: 45, endSec: 90, count: 6, level: 1 },
    ]);
    const fourHours = heatLevels(
      Array.from({ length: 960 }, (_, bucket) => ({ bucket, count: 1 })),
      14_400,
    );
    expect(fourHours.length).toBeLessThanOrEqual(90);
    expect(fourHours[0]).toMatchObject({ startSec: 0, endSec: 165 });
  });

  it("is empty without reactions", () => {
    expect(heatLevels([], 600)).toEqual([]);
    expect(heatLevels([{ bucket: 1, count: 0 }], 600)).toEqual([]);
  });
});

describe("hottestStretch", () => {
  it("widens the busiest bucket over neighbours at least half as busy", () => {
    expect(
      hottestStretch([
        { bucket: 9, count: 1 }, // below half: not included
        { bucket: 10, count: 3 },
        { bucket: 11, count: 6 },
        { bucket: 12, count: 4 },
        { bucket: 14, count: 6 }, // a gap breaks the stretch
      ]),
    ).toEqual({ startSec: 150, endSec: 195, peak: 6 });
  });

  it("picks the earliest on a tie, and nothing without reactions", () => {
    expect(
      hottestStretch([
        { bucket: 40, count: 2 },
        { bucket: 2, count: 2 },
      ]),
    ).toEqual({ startSec: 30, endSec: 45, peak: 2 });
    expect(hottestStretch([])).toBeNull();
  });
});

describe("adjustBucket", () => {
  const base = [
    { bucket: 2, count: 1 },
    { bucket: 5, count: 3 },
  ];
  it("adds, increments and removes emptied buckets, keeping order", () => {
    expect(adjustBucket(base, 3, 1)).toEqual([
      { bucket: 2, count: 1 },
      { bucket: 3, count: 1 },
      { bucket: 5, count: 3 },
    ]);
    expect(adjustBucket(base, 5, 1)).toEqual([
      { bucket: 2, count: 1 },
      { bucket: 5, count: 4 },
    ]);
    expect(adjustBucket(base, 2, -1)).toEqual([{ bucket: 5, count: 3 }]);
    expect(adjustBucket(base, 9, -1)).toEqual(base);
  });
});

describe("L shortcut", () => {
  const key = (overrides: Partial<KeyEventInfo>): KeyEventInfo => ({
    key: "l",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    targetTag: "BODY",
    targetEditable: false,
    ...overrides,
  });
  it("fires on a bare L outside text fields only", () => {
    expect(isLetterShortcut(key({}), "l")).toBe(true);
    expect(isLetterShortcut(key({ key: "L" }), "l")).toBe(true);
    expect(isLetterShortcut(key({ targetTag: "INPUT" }), "l")).toBe(false);
    expect(isLetterShortcut(key({ targetTag: "textarea" }), "l")).toBe(false);
    expect(isLetterShortcut(key({ targetEditable: true }), "l")).toBe(false);
    expect(isLetterShortcut(key({ metaKey: true }), "l")).toBe(false);
    expect(isLetterShortcut(key({ isComposing: true }), "l")).toBe(false);
    expect(isLetterShortcut(key({ key: "d" }), "l")).toBe(false);
  });
});

describe("who sees what", () => {
  it("shows others only spots at least two people marked", () => {
    expect(MIN_PEOPLE_SHOWN).toBe(2);
    expect(
      publicHeatmap({
        version: 4,
        buckets: [
          { bucket: 1, count: 1 },
          { bucket: 2, count: 2 },
          { bucket: 3, count: 7 },
        ],
      }),
    ).toEqual({
      version: 4,
      buckets: [
        { bucket: 2, count: 2 },
        { bucket: 3, count: 7 },
      ],
    });
  });

  it("always shows me my own marks: a hidden spot of mine has one person, me", () => {
    const shown = [{ bucket: 2, count: 3 }];
    expect(withMine(shown, [2, 5])).toEqual([
      { bucket: 2, count: 3 }, // already counts me
      { bucket: 5, count: 1 },
    ]);
    expect(withMine(shown, [])).toBe(shown);
  });
});
