// Minimal types for the YouTube IFrame Player API. @types/youtube's YT.PlayerError enum does
// not exist at runtime, so error codes are plain numbers here.

export type YTPlayer = {
  getCurrentTime(): number;
  getDuration(): number;
  getPlaybackRate(): number;
  getAvailablePlaybackRates(): number[];
  setPlaybackRate(rate: number): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getPlayerState(): number;
  destroy(): void;
};

export type YTPlayerEvent<T = undefined> = { target: YTPlayer; data: T };

export type YTPlayerOptions = {
  host?: string;
  videoId: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: YTPlayerEvent) => void;
    onStateChange?: (event: YTPlayerEvent<number>) => void;
    onPlaybackRateChange?: (event: YTPlayerEvent<number>) => void;
    onError?: (event: YTPlayerEvent<number>) => void;
  };
};

export type YTNamespace = {
  Player: new (element: HTMLElement | string, options: YTPlayerOptions) => YTPlayer;
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export const PLAYER_ERROR = {
  INVALID_PARAM: 2,
  HTML5: 5,
  NOT_FOUND: 100,
  NO_EMBED: 101,
  NO_EMBED_ALT: 150,
  NO_REFERRER: 153,
  LOADER_FAILED: -1,
} as const;
