import { connection } from "next/server";
import { AuthNotConfiguredError } from "@/features/auth/server/auth";
import { getSessionUserFromHeaders } from "@/features/auth/server/session";
import { devRoutesEnabled, nexconnPublicConfig } from "@/features/nexconn/server";
import { nexconnErrorResponse } from "@/features/nexconn/server/errors";
import { getChatToken } from "@/features/nexconn/server/tokens";
import { decideTokenIdentity, tokenRequestSchema } from "@/features/nexconn/shared/token-request";
import { db } from "@/lib/db";
import { consumeRate } from "@/lib/rate-limit.server";
import { checkSameOriginJson, readJsonBody, TOO_LARGE } from "@/lib/request-guard";

const noStore = { "Cache-Control": "no-store" };
const REFRESH_LIMIT = { window: 600, max: 5 };

export async function POST(request: Request) {
  await connection();
  const guard = checkSameOriginJson(request);
  if (!guard.ok) {
    return Response.json({ error: guard.reason }, { status: guard.status, headers: noStore });
  }

  const raw = await readJsonBody(request);
  if (raw === TOO_LARGE) {
    return Response.json({ error: "body_too_large" }, { status: 413, headers: noStore });
  }
  const parsed = tokenRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid_body" }, { status: 400, headers: noStore });
  }
  const { devUser, refresh } = parsed.data;

  try {
    const sessionUser = devUser ? null : await getSessionUserFromHeaders(request.headers);
    const identity = decideTokenIdentity({
      devUser,
      devRoutesEnabled: devRoutesEnabled(),
      sessionUser,
    });
    if (!identity.ok) {
      return Response.json(
        { error: identity.error },
        { status: identity.status, headers: noStore },
      );
    }

    // Repairs a user created before the sign-up hook set nexconnUserId.
    if (identity.backfill && sessionUser) {
      await db.user.updateMany({
        where: { id: sessionUser.id, nexconnUserId: null },
        data: { nexconnUserId: identity.userId },
      });
    }

    if (refresh) {
      const limit = await consumeRate(`nx:refresh:${identity.userId}`, REFRESH_LIMIT);
      if (!limit.allowed) {
        return Response.json(
          { error: "rate_limited" },
          { status: 429, headers: { ...noStore, "Retry-After": String(limit.retryAfter) } },
        );
      }
    }

    const { appKey, area } = nexconnPublicConfig();
    const token = await getChatToken({ userId: identity.userId, name: identity.name, refresh });
    return Response.json(
      { appKey, area, userId: token.userId, accessToken: token.accessToken },
      { headers: noStore },
    );
  } catch (error) {
    if (error instanceof AuthNotConfiguredError) {
      return Response.json({ error: "auth_not_configured" }, { status: 503, headers: noStore });
    }
    return nexconnErrorResponse(error);
  }
}
