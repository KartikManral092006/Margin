import { decodeContent, momentSchema } from "@/features/nexconn/shared/messages";

export const MOMENT_TAG = "mg-moment";
export const SEEK_EVENT = "mg-seek";

export type SeekEventDetail = { tSec: number; momentId: string };

type MessageModelLike = { content?: unknown } | null | undefined;

export function formatTimestamp(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const STYLES = `
  :host { display: block; font: 14px/1.4 system-ui, sans-serif; }
  button {
    all: unset; box-sizing: border-box; cursor: pointer; display: flex; gap: 8px; align-items: baseline;
    padding: 8px 12px; border-radius: 10px; border: 1px solid #d4d4d8; background: #fafafa; color: #18181b; max-width: 100%;
  }
  button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
  .time { font-variant-numeric: tabular-nums; font-weight: 600; color: #2563eb; white-space: nowrap; }
  .text { overflow-wrap: anywhere; }
  .invalid { color: #71717a; font-style: italic; }
  @media (prefers-color-scheme: dark) {
    button { background: #27272a; border-color: #3f3f46; color: #f4f4f5; }
    .time { color: #60a5fa; }
  }
`;

export function defineMomentElementClass(): CustomElementConstructor {
  return class MomentElement extends HTMLElement {
    #message: MessageModelLike = null;
    #root = this.attachShadow({ mode: "open" });

    get message(): MessageModelLike {
      return this.#message;
    }

    set message(value: MessageModelLike) {
      this.#message = value;
      this.#render();
    }

    connectedCallback() {
      this.#render();
    }

    #render() {
      const moment = decodeContent(momentSchema, this.#message?.content);
      const style = document.createElement("style");
      style.textContent = STYLES;

      if (!moment) {
        const fallback = document.createElement("span");
        fallback.className = "invalid";
        fallback.textContent = "Moment could not be displayed";
        this.#root.replaceChildren(style, fallback);
        return;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", `Jump to ${formatTimestamp(moment.tSec)}: ${moment.text}`);
      const time = document.createElement("span");
      time.className = "time";
      time.textContent = `▶ ${formatTimestamp(moment.tSec)}`;
      const text = document.createElement("span");
      text.className = "text";
      text.textContent = moment.text;
      button.append(time, text);
      button.addEventListener("click", () => {
        this.dispatchEvent(
          new CustomEvent<SeekEventDetail>(SEEK_EVENT, {
            detail: { tSec: moment.tSec, momentId: moment.momentId },
            bubbles: true,
            composed: true,
          }),
        );
      });
      this.#root.replaceChildren(style, button);
    }
  };
}
