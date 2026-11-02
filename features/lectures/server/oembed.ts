import { z } from "zod";
import { canonicalWatchUrl, YOUTUBE_ID_RE } from "@/features/lectures/shared/youtube";

const OEMBED_ENDPOINT = "https://www.youtube.com/oembed";
const MAX_BODY_CHARS = 64_000;

// Only the fields we store. `html` is ignored and never rendered.
const oembedSchema = z.object({ title: z.string(), author_name: z.string() });

export type VideoMeta = { title: string; channelName: string };
export type MetaError = "video_not_found" | "video_unavailable" | "youtube_unavailable";
export type MetaResult = { ok: true; meta: VideoMeta } | { ok: false; error: MetaError };

function clean(value: string, max: number): string {
  const text = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(text).slice(0, max).join("");
}

export function oembedUrl(videoId: string): string {
  // oEmbed ignores the host of the URL it is given, so we always send our own canonical URL.
  return `${OEMBED_ENDPOINT}?format=json&url=${encodeURIComponent(canonicalWatchUrl(videoId))}`;
}

export async function fetchYouTubeMeta(
  videoId: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 4000,
): Promise<MetaResult> {
  if (!YOUTUBE_ID_RE.test(videoId)) return { ok: false, error: "video_not_found" };

  let response: Response;
  try {
    response = await fetchImpl(oembedUrl(videoId), {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "youtube_unavailable" };
  }

  // Observed: 400 or 404 for unknown IDs, 403 for private videos.
  if (response.status === 400 || response.status === 404) {
    return { ok: false, error: "video_not_found" };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: "video_unavailable" };
  }
  if (!response.ok) return { ok: false, error: "youtube_unavailable" };

  const text = await response.text().catch(() => "");
  if (!text || text.length > MAX_BODY_CHARS) return { ok: false, error: "youtube_unavailable" };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "youtube_unavailable" };
  }
  const parsed = oembedSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "youtube_unavailable" };

  const title = clean(parsed.data.title, 300);
  if (!title) return { ok: false, error: "video_not_found" };
  return { ok: true, meta: { title, channelName: clean(parsed.data.author_name, 200) } };
}
