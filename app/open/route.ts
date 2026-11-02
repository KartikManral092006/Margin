import { connection, NextResponse, type NextRequest } from "next/server";
import { getSessionUserFromHeaders } from "@/features/auth/server/session";
import { signInRedirectPath } from "@/features/auth/shared/routes";
import { findPublicByYoutubeId } from "@/features/lectures/server/lectures";
import { parseStartSec, parseYouTubeUrl, YOUTUBE_ID_RE } from "@/features/lectures/shared/youtube";
import { db } from "@/lib/db";

// Target of the paste form (GET, works without JS). It only reads and redirects with real
// 307s; creating a room needs the POST on /lectures/new. Not behind the proxy on purpose:
// the proxy would put the raw pasted URL into callbackURL.
export async function GET(request: NextRequest) {
  await connection();
  const params = request.nextUrl.searchParams;
  const v = params.get("v");
  const parsed =
    v !== null && YOUTUBE_ID_RE.test(v)
      ? { videoId: v, startSec: parseStartSec(params.get("t")) }
      : parseYouTubeUrl(params.get("url"));

  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));
  if (!parsed) return to("/?error=invalid_url");

  const t = parsed.startSec ? `t=${parsed.startSec}` : "";
  const user = await getSessionUserFromHeaders(request.headers).catch(() => null);
  if (!user) return to(signInRedirectPath(`/open?v=${parsed.videoId}${t ? `&${t}` : ""}`));

  const room = await findPublicByYoutubeId(db, parsed.videoId);
  if (room) return to(`/lectures/${room.id}${t ? `?${t}` : ""}`);
  return to(`/lectures/new?v=${parsed.videoId}${t ? `&${t}` : ""}`);
}
