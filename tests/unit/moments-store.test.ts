import { describe, expect, it } from "vitest";
import type { MomentView } from "@/features/moments/shared/schemas";
import {
  EMPTY_MOMENTS,
  isComposerShortcut,
  momentsReducer,
  newClientId,
  windowFor,
  type MomentsState,
} from "@/features/moments/shared/store";

function view(overrides: Partial<MomentView> = {}): MomentView {
  return {
    id: "m1",
    lectureId: "L",
    tSec: 60,
    body: "doubt",
    parentId: null,
    status: "open",
    upvotes: 0,
    pinned: false,
    authorName: "Ana",
    mine: false,
    clientId: null,
    createdAt: "2026-11-02T10:00:00.000Z",
    ...overrides,
  };
}

const optimistic = (clientId: string, tSec = 30) =>
  momentsReducer(EMPTY_MOMENTS, {
    type: "optimistic",
    moment: { ...view({ id: clientId, tSec, mine: true }), clientId },
    at: 1,
  });

describe("momentsReducer", () => {
  it("shows an optimistic doubt at once, marked sending", () => {
    const state = optimistic("c1");
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ key: "c1", local: "sending" });
  });

  it("swaps the temp id for the server id when the POST answers", () => {
    const state = momentsReducer(optimistic("c1"), {
      type: "confirmed",
      clientId: "c1",
      moment: view({ id: "srv1", tSec: 30, mine: true, clientId: "c1" }),
      at: 2,
    });
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ key: "srv1", local: null });
  });

  it("does not duplicate when the live signal arrives before the POST answers", () => {
    let state = optimistic("c1");
    state = momentsReducer(state, {
      type: "merge",
      moments: [view({ id: "srv1", tSec: 30, mine: true, clientId: "c1" })],
      at: 2,
    });
    state = momentsReducer(state, {
      type: "confirmed",
      clientId: "c1",
      moment: view({ id: "srv1", tSec: 30, mine: true, clientId: "c1" }),
      at: 2,
    });
    expect(state.items.map((item) => item.key)).toEqual(["srv1"]);
  });

  it("keeps 'mine' when the live signal (which doesn't know the viewer) updates my doubt", () => {
    let state = momentsReducer(optimistic("c1"), {
      type: "confirmed",
      clientId: "c1",
      moment: view({ id: "srv1", tSec: 30, mine: true, clientId: "c1" }),
      at: 2,
    });
    state = momentsReducer(state, {
      type: "merge",
      moments: [
        view({ id: "srv1", tSec: 30, mine: false, clientId: "c1", authorName: "Learner X" }),
      ],
      at: 2,
    });
    expect(state.items).toHaveLength(1);
    expect(state.items[0]?.mine).toBe(true);
  });

  it("replaces my optimistic copy when the signal arrives first, and keeps it mine", () => {
    const state = momentsReducer(optimistic("c1"), {
      type: "merge",
      moments: [view({ id: "srv1", tSec: 30, mine: false, clientId: "c1" })],
      at: 2,
    });
    expect(state.items.map((item) => [item.key, item.mine, item.local])).toEqual([
      ["srv1", true, null],
    ]);
  });

  it("does not duplicate a moment received twice", () => {
    let state: MomentsState = EMPTY_MOMENTS;
    state = momentsReducer(state, { type: "merge", moments: [view()], at: 2 });
    state = momentsReducer(state, { type: "merge", moments: [view()], at: 2 });
    expect(state.items).toHaveLength(1);
  });

  it("rolls back a doubt the server rejected", () => {
    const state = momentsReducer(optimistic("c1"), {
      type: "failed",
      clientId: "c1",
      error: "invalid_body",
      retryable: false,
    });
    expect(state.items).toHaveLength(0);
  });

  it("keeps a doubt that failed on the network, ready to retry", () => {
    let state = momentsReducer(optimistic("c1"), {
      type: "failed",
      clientId: "c1",
      error: "network",
      retryable: true,
    });
    expect(state.items[0]).toMatchObject({ local: "failed", error: "network" });
    state = momentsReducer(state, { type: "retrying", clientId: "c1" });
    expect(state.items[0]).toMatchObject({ local: "sending", error: null });
  });

  it("orders by second, then by creation time", () => {
    const state = momentsReducer(EMPTY_MOMENTS, {
      type: "merge",
      moments: [
        view({ id: "b", tSec: 90 }),
        view({ id: "a2", tSec: 30, createdAt: "2026-11-02T10:00:02.000Z" }),
        view({ id: "a1", tSec: 30, createdAt: "2026-11-02T10:00:01.000Z" }),
      ],
      at: 2,
    });
    expect(state.items.map((item) => item.key)).toEqual(["a1", "a2", "b"]);
  });

  it("a window reload that started earlier keeps a live doubt that arrived meanwhile", () => {
    let state = momentsReducer(EMPTY_MOMENTS, {
      type: "merge",
      moments: [view({ id: "live", tSec: 100 })],
      at: 20, // arrived over Nexconn after the GET below started
    });
    state = momentsReducer(state, {
      type: "replaceWindow",
      from: 0,
      to: 900,
      moments: [],
      requestedAt: 10,
      at: 30,
    });
    expect(state.items.map((item) => item.key)).toEqual(["live"]);
  });

  it("replacing a window drops confirmed items the server no longer returns, keeps others", () => {
    let state = momentsReducer(EMPTY_MOMENTS, {
      type: "merge",
      moments: [view({ id: "inside", tSec: 100 }), view({ id: "outside", tSec: 2000 })],
      at: 2,
    });
    state = momentsReducer(state, {
      type: "optimistic",
      moment: { ...view({ id: "c9", tSec: 120, mine: true }), clientId: "c9" },
      at: 3,
    });
    state = momentsReducer(state, {
      type: "replaceWindow",
      from: 0,
      to: 900,
      moments: [],
      requestedAt: 10,
      at: 11,
    });
    expect(state.items.map((item) => item.key).sort()).toEqual(["c9", "outside"]);
  });
});

describe("isComposerShortcut", () => {
  const base = {
    key: "d",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    targetTag: "BODY",
    targetEditable: false,
  };

  it("opens on d or D outside text fields", () => {
    expect(isComposerShortcut(base)).toBe(true);
    expect(isComposerShortcut({ ...base, key: "D" })).toBe(true);
  });

  it.each([
    ["typing in an input", { targetTag: "INPUT" }],
    ["typing in a textarea", { targetTag: "textarea" }],
    ["a contenteditable", { targetEditable: true }],
    ["Cmd+D", { metaKey: true }],
    ["Ctrl+D", { ctrlKey: true }],
    ["IME composition", { isComposing: true }],
    ["another key", { key: "f" }],
  ])("ignores %s", (_label, overrides) => {
    expect(isComposerShortcut({ ...base, ...overrides })).toBe(false);
  });
});

describe("windowFor", () => {
  it.each([
    [0, { from: 0, to: 600 }],
    [299, { from: 0, to: 600 }],
    [300, { from: 0, to: 900 }],
    [1800, { from: 1500, to: 2400 }],
  ])("%s s -> %j", (tSec, expected) => {
    expect(windowFor(tSec)).toEqual(expected);
  });

  it("never spans more than the API allows", () => {
    const w = windowFor(5000);
    expect(w.to - w.from).toBeLessThanOrEqual(1800);
  });
});

describe("newClientId", () => {
  it("matches the API's clientId format", () => {
    expect(newClientId()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });
});
