// Video IDs are case-sensitive: never lowercase them.
export const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
]);
const NOCOOKIE_HOSTS = new Set(["youtube-nocookie.com", "www.youtube-nocookie.com"]);
const PATH_ID_PREFIXES = new Set(["shorts", "embed", "live", "v", "e"]);
const MAX_START_SEC = 86_400;
const MAX_URL_LENGTH = 2048;

export type ParsedYouTube = { videoId: string; startSec: number | null };

// Accepts 90, 90s, 2m, 1m30s, 1h2m3s. Anything else (including 0 and m:ss) means "no start".
export function parseStartSec(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const value = raw.trim().toLowerCase();
  let seconds: number;
  if (/^\d{1,6}$/.test(value)) {
    seconds = Number(value);
  } else {
    const match = /^(?:(\d{1,3})h)?(?:(\d{1,4})m)?(?:(\d{1,6})s)?$/.exec(value);
    if (!match || (!match[1] && !match[2] && !match[3])) return null;
    seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  }
  return seconds > 0 && seconds <= MAX_START_SEC ? seconds : null;
}

function idOrNull(id: string | null | undefined): string | null {
  return id != null && YOUTUBE_ID_RE.test(id) ? id : null;
}

function startFrom(url: URL): number | null {
  const query = url.searchParams;
  const hash = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : "");
  return parseStartSec(query.get("t") ?? query.get("start") ?? hash.get("t") ?? hash.get("start"));
}

function fromUrl(url: URL, depth: number): ParsedYouTube | null {
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;
  // Exact host match after WHATWG parsing: rejects youtube.com.evil.com and "youtube.com.".
  const host = url.hostname;
  const segments = url.pathname.split("/").filter(Boolean);

  let id: string | null = null;
  if (host === "youtu.be") {
    if (segments.length === 1) id = idOrNull(segments[0]);
  } else if (NOCOOKIE_HOSTS.has(host)) {
    if (segments.length === 2 && segments[0] === "embed") id = idOrNull(segments[1]);
  } else if (YOUTUBE_HOSTS.has(host)) {
    const [first, second] = segments;
    if (segments.length === 1 && first === "watch") {
      id = idOrNull(url.searchParams.get("v"));
    } else if (segments.length === 2 && first !== undefined && PATH_ID_PREFIXES.has(first)) {
      id = idOrNull(second);
    } else if (segments.length === 1 && first === "attribution_link" && depth === 0) {
      const inner = url.searchParams.get("u");
      if (!inner || !inner.startsWith("/") || inner.startsWith("//") || inner.startsWith("/\\")) {
        return null;
      }
      return fromUrl(new URL(inner, "https://www.youtube.com"), 1);
    }
  }
  return id ? { videoId: id, startSec: startFrom(url) } : null;
}

export function parseYouTubeUrl(input: unknown): ParsedYouTube | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value || value.length > MAX_URL_LENGTH) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    return fromUrl(new URL(withScheme), 0);
  } catch {
    return null;
  }
}

export function canonicalWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
