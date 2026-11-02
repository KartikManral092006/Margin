import { followPlan, SEEK_ABOVE_SEC, type PartyState } from "@/features/party/shared/sync";

// What the follower needs from a player (the time store implements all of it).
export type PlayerControl = {
  time(): number;
  playing(): boolean;
  ended(): boolean;
  duration(): number | null;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setRate(rate: number): void;
};

// After a seek the player needs a few seconds to load, and meanwhile can still report the old
// time. Seeking again to the same spot would restart the load (a seek loop), so within this
// time only a new target (the host jumped again) seeks; other corrections wait.
export const SEEK_COOLDOWN_MS = 4000;
// A seek while playing aims this far ahead (in seconds of loading time), so the player comes
// out of loading where the host is by then. Learned from where each seek actually lands.
export const INITIAL_LOAD_SEC = 0.5;
const MAX_LOAD_SEC = 4;
// A seek has landed once the player has played on this far from the target.
const LANDED_SEC = 0.25;

// Runs once a second (and on every host message) for a viewer in a party. The viewer plays at
// the host's rate; a speed change stays on for its computed duration, then the rate goes back
// to the host's and the drift is measured again; a big drift seeks at once.
export function createFollower(control: PlayerControl) {
  let baseRate = 1;
  let rateUntil = 0;
  let lastSeek: { to: number; at: number; playing: boolean; rate: number } | null = null;
  let loadSec = INITIAL_LOAD_SEC;
  let measureLanding = false;

  function resetRate() {
    if (rateUntil !== 0) control.setRate(baseRate);
    rateUntil = 0;
  }

  return {
    // nowMs: the local clock (for the speed-change timer). serverNow: the server-clock estimate.
    step(state: PartyState, nowMs: number, serverNow: number): { drift: number } {
      if (state.rate !== baseRate) {
        baseRate = state.rate;
        rateUntil = 0;
        control.setRate(baseRate);
      }
      const viewerTime = control.time();
      const plan = followPlan({
        state,
        serverNow,
        viewerTime,
        viewerPlaying: control.playing(),
        duration: control.duration(),
        viewerEnded: control.ended(),
      });
      if (plan.playing && !control.playing()) control.play();
      if (!plan.playing && control.playing()) control.pause();

      const next = plan.correction;
      const lead = plan.playing ? loadSec * baseRate : 0;
      const sinceSeekMs = lastSeek ? nowMs - lastSeek.at : Infinity;
      if (lastSeek && sinceSeekMs < SEEK_COOLDOWN_MS) {
        const moved = lastSeek.playing ? (lastSeek.rate * sinceSeekMs) / 1000 : 0;
        // Already loaded: playing on from the target, by no more than playback explains (a
        // stale report of the old spot fails this either way).
        const progressed = viewerTime - lastSeek.to;
        const landed = lastSeek.playing && progressed > LANDED_SEC && progressed <= moved;
        const sameSpot =
          next.action !== "seek" ||
          Math.abs(next.to + lead - (lastSeek.to + moved)) <= SEEK_ABOVE_SEC;
        if (!landed && sameSpot) return { drift: plan.drift };
      }
      // The first look after a playing seek settles: behind means loading took longer. Half
      // steps, so one unusually slow or fast load doesn't swing the next seek the other way.
      if (measureLanding && lastSeek?.playing && plan.playing) {
        const error = plan.drift / baseRate;
        loadSec = Math.min(MAX_LOAD_SEC, Math.max(0, loadSec - error / 2));
      }
      measureLanding = false;

      if (next.action === "seek") {
        resetRate();
        control.seek(next.to + lead);
        lastSeek = { to: next.to + lead, at: nowMs, playing: plan.playing, rate: baseRate };
        measureLanding = true;
      } else if (next.action === "none" || !plan.playing) {
        resetRate();
      } else if (rateUntil !== 0 && nowMs >= rateUntil) {
        resetRate();
      } else if (rateUntil === 0) {
        control.setRate(next.rate);
        rateUntil = nowMs + next.durationMs;
      }
      return { drift: plan.drift };
    },
    // Leaving the party: back to normal speed.
    stop() {
      if (rateUntil !== 0 || baseRate !== 1) control.setRate(1);
      rateUntil = 0;
      baseRate = 1;
    },
  };
}
