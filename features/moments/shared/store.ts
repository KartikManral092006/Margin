import type { MomentView } from "@/features/moments/shared/schemas";
import { isLetterShortcut, type KeyEventInfo } from "@/lib/shortcuts";

// Client-side list of moments. Pure, so it is tested in node; the React side wraps it.
// Keys: a moment from the server is keyed by its id; an optimistic one by its clientId until
// the server answers, then it is re-keyed to the id (and any duplicate with that id merged).

export type LocalState = "sending" | "failed";

export type MomentItem = MomentView & {
  key: string;
  local: LocalState | null;
  error: string | null;
  // Client clock (ms) when this copy arrived; a window reload started earlier can't remove it.
  seenAt: number;
};

export type MomentsState = { items: MomentItem[] };

export type MomentsAction =
  | { type: "optimistic"; moment: MomentView & { clientId: string }; at: number }
  | { type: "confirmed"; clientId: string; moment: MomentView; at: number }
  | { type: "failed"; clientId: string; error: string; retryable: boolean }
  | { type: "retrying"; clientId: string }
  | { type: "merge"; moments: MomentView[]; at: number }
  // A live MG:Moment: adds a doubt this browser doesn't have (or replaces its own optimistic
  // copy) but never overwrites fuller data from the API, e.g. after a resent signal.
  | { type: "incoming"; moment: MomentView; at: number }
  // Optimistic vote / status change; the API's answer (a "merge") then settles it.
  | { type: "vote"; id: string; on: boolean }
  | { type: "status"; id: string; status: "open" | "resolved" }
  | {
      type: "replaceWindow";
      from: number;
      to: number;
      moments: MomentView[];
      // When the GET for this window started.
      requestedAt: number;
      at: number;
    };

export const EMPTY_MOMENTS: MomentsState = { items: [] };

// The list covers a window around the playhead; it moves in 5-minute steps
// (one step behind, the current one and one ahead: 15 minutes, under MAX_WINDOW_SEC).
export const WINDOW_STEP_SEC = 300;

export function windowFor(tSec: number): { from: number; to: number } {
  const step = Math.floor(Math.max(0, tSec) / WINDOW_STEP_SEC);
  return { from: Math.max(0, (step - 1) * WINDOW_STEP_SEC), to: (step + 2) * WINDOW_STEP_SEC };
}

function fromServer(moment: MomentView, at: number): MomentItem {
  return { ...moment, key: moment.id, local: null, error: null, seenAt: at };
}

// Stable order: by second, then by creation time, then by key.
function sorted(items: MomentItem[]): MomentItem[] {
  return [...items].sort(
    (a, b) =>
      a.tSec - b.tSec || a.createdAt.localeCompare(b.createdAt) || a.key.localeCompare(b.key),
  );
}

function upsertServer(items: MomentItem[], moment: MomentView, at: number): MomentItem[] {
  let mine = moment.mine;
  const next = items.filter((item) => {
    const sameMoment = item.key === moment.id;
    // The author's optimistic copy, matched by clientId, is replaced by the server copy.
    const ownCopy =
      item.local !== null && moment.clientId !== null && item.clientId === moment.clientId;
    // A live signal doesn't know who is watching; keep "mine" from the copy we already had.
    if ((sameMoment || ownCopy) && item.mine) mine = true;
    return !sameMoment && !ownCopy;
  });
  next.push(fromServer({ ...moment, mine }, at));
  return next;
}

export function momentsReducer(state: MomentsState, action: MomentsAction): MomentsState {
  switch (action.type) {
    case "optimistic": {
      if (state.items.some((item) => item.key === action.moment.clientId)) return state;
      const item: MomentItem = {
        ...action.moment,
        key: action.moment.clientId,
        local: "sending",
        error: null,
        seenAt: action.at,
      };
      return { items: sorted([...state.items, item]) };
    }
    case "confirmed":
      return { items: sorted(upsertServer(state.items, action.moment, action.at)) };
    case "failed": {
      // A rejected doubt (4xx) is rolled back; a network failure stays, marked for retry.
      if (!action.retryable) {
        return { items: state.items.filter((item) => item.key !== action.clientId) };
      }
      return {
        items: state.items.map((item) =>
          item.key === action.clientId ? { ...item, local: "failed", error: action.error } : item,
        ),
      };
    }
    case "retrying":
      return {
        items: state.items.map((item) =>
          item.key === action.clientId ? { ...item, local: "sending", error: null } : item,
        ),
      };
    case "incoming": {
      if (state.items.some((item) => item.key === action.moment.id && item.local === null)) {
        return state;
      }
      return { items: sorted(upsertServer(state.items, action.moment, action.at)) };
    }
    case "vote": {
      let changed = false;
      const items = state.items.map((item) => {
        if (item.key !== action.id || item.votedByMe === action.on) return item;
        changed = true;
        return {
          ...item,
          votedByMe: action.on,
          upvotes: Math.max(0, item.upvotes + (action.on ? 1 : -1)),
        };
      });
      return changed ? { items } : state;
    }
    case "status":
      return {
        items: state.items.map((item) =>
          item.key === action.id ? { ...item, status: action.status } : item,
        ),
      };
    case "merge": {
      let items = state.items;
      for (const moment of action.moments) items = upsertServer(items, moment, action.at);
      return items === state.items ? state : { items: sorted(items) };
    }
    case "replaceWindow": {
      // The server's answer for [from, to] is complete as of when it was requested: drop
      // confirmed items in that range that it doesn't return, unless they arrived after the
      // request started (a live doubt the answer couldn't include yet). Keep pending local
      // items and items outside the range.
      const kept = state.items.filter(
        (item) =>
          item.local !== null ||
          item.seenAt >= action.requestedAt ||
          item.tSec < action.from ||
          item.tSec > action.to,
      );
      let items = kept;
      for (const moment of action.moments) items = upsertServer(items, moment, action.at);
      return { items: sorted(items) };
    }
  }
}

// Keyboard: D opens the composer, unless the user is typing somewhere or holds a modifier.
// D opens the composer (outside text fields, without modifiers).
export function isComposerShortcut(event: KeyEventInfo): boolean {
  return isLetterShortcut(event, "d");
}

export function newClientId(
  randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n)),
) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return `c${Array.from(randomBytes(20), (byte) => alphabet[byte % alphabet.length]).join("")}`;
}
