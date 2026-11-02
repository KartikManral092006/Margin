import "server-only";
import { AuthNotConfiguredError } from "@/features/auth/server/auth";
import { getSessionUserFromHeaders, type SessionUser } from "@/features/auth/server/session";
import type { RateDecision } from "@/lib/rate-limit";

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export function rateLimited(decision: Pick<RateDecision, "retryAfter">): Response {
  return json({ error: "rate_limited" }, 429, { "Retry-After": String(decision.retryAfter ?? 60) });
}

export async function requireUser(
  request: Request,
): Promise<{ ok: true; user: SessionUser } | { ok: false; response: Response }> {
  try {
    const user = await getSessionUserFromHeaders(request.headers);
    if (!user) return { ok: false, response: json({ error: "unauthorized" }, 401) };
    return { ok: true, user };
  } catch (error) {
    if (error instanceof AuthNotConfiguredError) {
      return { ok: false, response: json({ error: "auth_not_configured" }, 503) };
    }
    throw error;
  }
}
