import type { YTNamespace } from "@/features/player/client/yt-types";

const SCRIPT_ID = "yt-iframe-api";
const SCRIPT_SRC = "https://www.youtube.com/iframe_api";
const LOAD_TIMEOUT_MS = 15_000;

let loading: Promise<YTNamespace> | null = null;

// Forget a failed or stalled load completely, so the next call injects the API again.
function reset() {
  loading = null;
  document.getElementById(SCRIPT_ID)?.remove();
  // The bootstrap sets YT.loading and won't inject its widget script twice.
  if (window.YT && !window.YT.Player) delete window.YT;
}

// Loads the IFrame API once per page. Chains onto any existing onYouTubeIframeAPIReady instead
// of replacing it, and resets on failure or after 15 s so a later mount can retry.
export function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("browser only"));
  if (window.YT?.Player) return Promise.resolve(window.YT);

  loading ??= new Promise<YTNamespace>((resolve, reject) => {
    const fail = (message: string) => {
      window.clearTimeout(timer);
      reset();
      reject(new Error(message));
    };
    const timer = window.setTimeout(() => fail("YouTube API timed out"), LOAD_TIMEOUT_MS);

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      window.clearTimeout(timer);
      if (window.YT?.Player) resolve(window.YT);
      else fail("YouTube API loaded without YT.Player");
    };

    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onerror = () => fail("YouTube API failed to load");
      document.head.appendChild(script);
    }
  });
  return loading;
}
