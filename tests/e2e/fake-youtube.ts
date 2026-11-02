import type { BrowserContext } from "@playwright/test";

// YouTube refuses playback to datacenter IPs ("Sign in to confirm you're not a bot", reported
// to the embed as error 150), so on CI runners a video loads but never plays. Tests that need
// real playback use this stand-in for the IFrame API there: same methods, events and state
// codes, a short buffering spell before playing and after a seek, and a clock-driven playhead.
// Locally the real player is used unless E2E_FAKE_YOUTUBE=1.
export const FAKE_YOUTUBE = Boolean(process.env.CI) || process.env.E2E_FAKE_YOUTUBE === "1";

const BUFFER_MS = 300;
const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export async function fakeYouTube(context: BrowserContext, durationSec: number) {
  await context.addInitScript(install, { durationSec, bufferMs: BUFFER_MS, rates: RATES });
}

type Options = { durationSec: number; bufferMs: number; rates: number[] };
type Handler = (event: { target: unknown; data?: number }) => void;
type PlayerOptions = {
  playerVars?: { start?: number };
  events?: Partial<Record<"onReady" | "onStateChange" | "onPlaybackRateChange", Handler>>;
};

// Runs in the page, before the app: the app's loader finds window.YT.Player and never
// injects YouTube's script.
function install({ durationSec, bufferMs, rates }: Options) {
  const STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

  class FakePlayer {
    private state = STATE.CUED;
    private rate = 1;
    // Playhead at `since` (ms); it moves only while playing.
    private base: number;
    private since = performance.now();
    private bufferTimer = 0;
    private endTimer = 0;
    private events: PlayerOptions["events"];

    constructor(element: HTMLElement, options: PlayerOptions) {
      this.events = options.events;
      this.base = options.playerVars?.start ?? 0;
      const screen = document.createElement("div");
      screen.style.cssText = "width:100%;height:100%;background:#000";
      element.replaceWith(screen);
      setTimeout(() => this.events?.onReady?.({ target: this }), 50);
    }

    private emit(state: number) {
      this.state = state;
      this.events?.onStateChange?.({ target: this, data: state });
    }

    // Freeze the playhead where it is now.
    private settle() {
      this.base = this.getCurrentTime();
      this.since = performance.now();
    }

    private startPlaying() {
      this.settle();
      this.emit(STATE.PLAYING);
      clearTimeout(this.endTimer);
      this.endTimer = window.setTimeout(
        () => {
          this.base = durationSec;
          this.since = performance.now();
          this.emit(STATE.ENDED);
        },
        ((durationSec - this.base) / this.rate) * 1000,
      );
    }

    private buffer() {
      this.settle();
      clearTimeout(this.endTimer);
      clearTimeout(this.bufferTimer);
      this.emit(STATE.BUFFERING);
      this.bufferTimer = window.setTimeout(() => this.startPlaying(), bufferMs);
    }

    getCurrentTime() {
      if (this.state !== STATE.PLAYING) return this.base;
      const moved = ((performance.now() - this.since) / 1000) * this.rate;
      return Math.min(durationSec, this.base + moved);
    }
    getDuration() {
      return durationSec;
    }
    getPlaybackRate() {
      return this.rate;
    }
    getAvailablePlaybackRates() {
      return rates;
    }
    getPlayerState() {
      return this.state;
    }
    setPlaybackRate(rate: number) {
      if (!rates.includes(rate) || rate === this.rate) return;
      this.settle();
      this.rate = rate;
      if (this.state === STATE.PLAYING) this.startPlaying();
      this.events?.onPlaybackRateChange?.({ target: this, data: rate });
    }
    // As documented for YouTube: a paused player stays paused; from any other state it plays.
    seekTo(seconds: number) {
      this.base = Math.min(durationSec, Math.max(0, seconds));
      this.since = performance.now();
      if (this.state !== STATE.PAUSED) this.buffer();
    }
    playVideo() {
      if (this.state !== STATE.PLAYING && this.state !== STATE.BUFFERING) this.buffer();
    }
    pauseVideo() {
      if (this.state === STATE.PAUSED) return;
      this.settle();
      clearTimeout(this.bufferTimer);
      clearTimeout(this.endTimer);
      this.emit(STATE.PAUSED);
    }
    destroy() {
      clearTimeout(this.bufferTimer);
      clearTimeout(this.endTimer);
      this.events = undefined;
    }
  }

  (window as unknown as { YT: unknown }).YT = { Player: FakePlayer };
}
