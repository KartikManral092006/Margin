import { connection, type NextRequest } from "next/server";
import { nexconnDisplayName } from "@/features/auth/shared/display-name";
import { json, rateLimited, requireUser } from "@/features/lectures/server/http";
import { getLectureForViewer } from "@/features/lectures/server/lectures";
import { LECTURE_ID_RE } from "@/features/lectures/shared/schemas";
import { heatmapVersion, readHeatmap } from "@/features/heatmap/server/heatmap";
import { publicHeatmap } from "@/features/heatmap/shared/heatmap";
import { readPresence, recordHeartbeat } from "@/features/presence/server/presence";
import { buildSnapshot, heartbeatBody } from "@/features/presence/shared/presence";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { consumeRate } from "@/lib/rate-limit.server";
import { redis } from "@/lib/redis";
import { checkSameOriginJson, readJsonBody, TOO_LARGE } from "@/lib/request-guard";

const SNAPSHOT_MS = 3000;
// The heatmap version is one small Redis read, so it is checked every second.
const HEAT_CHECK_MS = 1000;
// A full read from Postgres now and then, in case a change's version bump was lost to a Redis
// failure (the version then doesn't move).
const HEAT_RESYNC_MS = 60_000;
const KEEPALIVE_MS = 15_000;
// The browser's EventSource reconnects by itself; closing bounds every stream's lifetime.
const MAX_STREAM_MS = 10 * 60_000;

type Ctx = RouteContext<"/api/lectures/[id]/presence">;

async function roomFor(request: NextRequest, ctx: Ctx) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth;
  const { id } = await ctx.params;
  if (!LECTURE_ID_RE.test(id))
    return { ok: false as const, response: json({ error: "not_found" }, 404) };
  const viewer = await getLectureForViewer(db, id, auth.user.id);
  if (!viewer) return { ok: false as const, response: json({ error: "not_found" }, 404) };
  return { ok: true as const, user: auth.user, lectureId: id };
}

// Server-Sent Events, only when something changed: who is at which 30-second window of this
// lecture ("presence", every 3 s), and where people got lost ("heatmap": public counts only,
// checked every second, read when its version moves or once a minute). A keep-alive comment
// every 15 s.
export async function GET(request: NextRequest, ctx: Ctx) {
  await connection();
  const room = await roomFor(request, ctx);
  if (!room.ok) return room.response;

  const limit = await consumeRate(`pr:stream:${room.user.id}`, { window: 60, max: 30 });
  if (!limit.allowed) return rateLimited(limit);

  const encoder = new TextEncoder();
  const { lectureId } = room;
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let last = "";
      let heatVersion: number | null = null;
      let heatReadAt = 0;
      let heatSent = "";
      let heatChecking = false;
      const send = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(snapshotTimer);
        clearInterval(heatTimer);
        clearInterval(keepAliveTimer);
        clearTimeout(lifetimeTimer);
        request.signal.removeEventListener("abort", close);
        controller.close();
      };
      const tick = async () => {
        try {
          const entries = await readPresence(redis, lectureId, Date.now());
          const snapshot = JSON.stringify(buildSnapshot(entries, room.user.id));
          if (snapshot !== last) {
            last = snapshot;
            send(`event: presence\ndata: ${snapshot}\n\n`);
          }
        } catch (error) {
          logger.warn({ err: error, lectureId }, "presence snapshot failed");
        }
      };
      const checkHeat = async () => {
        if (heatChecking) return;
        heatChecking = true;
        try {
          // Without Redis the version is unknown; the periodic fresh read still runs.
          const version = await heatmapVersion(redis, lectureId).catch(() => null);
          const resync = Date.now() - heatReadAt >= HEAT_RESYNC_MS;
          if ((version !== null && version !== heatVersion) || resync) {
            const heatmap = await readHeatmap(db, redis, lectureId, { fresh: resync });
            heatVersion = version;
            heatReadAt = Date.now();
            const data = JSON.stringify(publicHeatmap(heatmap));
            if (data !== heatSent) {
              heatSent = data;
              send(`event: heatmap\ndata: ${data}\n\n`);
            }
          }
        } catch (error) {
          logger.warn({ err: error, lectureId }, "heatmap update failed");
        } finally {
          heatChecking = false;
        }
      };

      send("retry: 3000\n\n");
      void tick();
      void checkHeat();
      const snapshotTimer = setInterval(() => void tick(), SNAPSHOT_MS);
      const heatTimer = setInterval(() => void checkHeat(), HEAT_CHECK_MS);
      const keepAliveTimer = setInterval(() => send(": keep-alive\n\n"), KEEPALIVE_MS);
      const lifetimeTimer = setTimeout(close, MAX_STREAM_MS);
      request.signal.addEventListener("abort", close);
      cleanup = close;
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // Stops proxies (e.g. nginx) from buffering the stream.
      "X-Accel-Buffering": "no",
    },
  });
}

// Heartbeat: "I am at tSec". Sent every 10 s and whenever the viewer's window changes.
export async function POST(request: NextRequest, ctx: Ctx) {
  await connection();
  const guard = checkSameOriginJson(request);
  if (!guard.ok) return json({ error: guard.reason }, guard.status);

  const room = await roomFor(request, ctx);
  if (!room.ok) return room.response;

  const limit = await consumeRate(`pr:beat:${room.user.id}`, { window: 60, max: 30 });
  if (!limit.allowed) return rateLimited(limit);

  const raw = await readJsonBody(request);
  if (raw === TOO_LARGE) return json({ error: "body_too_large" }, 413);
  const body = heartbeatBody.safeParse(raw);
  if (!body.success) return json({ error: "invalid_body" }, 400);

  const name = nexconnDisplayName({
    name: room.user.name,
    nexconnUserId: room.user.nexconnUserId ?? room.user.id,
  });
  await recordHeartbeat(
    redis,
    room.lectureId,
    { userId: room.user.id, name, tSec: Math.floor(body.data.tSec), playing: body.data.playing },
    Date.now(),
  );
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
