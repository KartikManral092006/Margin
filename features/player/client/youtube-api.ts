import type { YTNamespace } from "@/features/player/client/yt-types";

const SCRIPT_ID = "yt-iframe-api";
const SCRIPT_SRC = "https://www.youtube.com/iframe_api";

let loading: Promise<YTNamespace> | null = null;

// Loads the IFrame API once per page. Chains onto any existing onYouTubeIframeAPIReady instead
// of replacing it, and resets on failure so a later mount can retry.
export function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("browser only"));
  if (window.YT?.Player) return Promise.resolve(window.YT);

  loading ??= new Promise<YTNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube API loaded without YT.Player"));
    };

    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onerror = () => {
        script.remove();
        loading = null;
        reject(new Error("YouTube API failed to load"));
      };
      document.head.appendChild(script);
    }
  });
  return loading;
}
