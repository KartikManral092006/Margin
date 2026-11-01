import "server-only";
import { NexconnApiError } from "@/features/nexconn/server/client";
import { devRoutesEnabled, NexconnNotConfiguredError } from "@/features/nexconn/server";
import { logger } from "@/lib/logger";
import { checkSameOriginJson } from "@/lib/request-guard";

const noStore = { "Cache-Control": "no-store" };

export function nexconnErrorResponse(error: unknown): Response {
  if (error instanceof NexconnNotConfiguredError) {
    return Response.json({ error: "nexconn_not_configured" }, { status: 503, headers: noStore });
  }
  if (error instanceof NexconnApiError) {
    logger.warn(
      {
        path: error.path,
        httpStatus: error.httpStatus,
        code: error.code,
        requestId: error.requestId,
      },
      "nexconn api error",
    );
    return Response.json(
      { error: "nexconn_api_error", code: error.code },
      { status: 502, headers: noStore },
    );
  }
  logger.error({ err: error }, "unexpected nexconn route error");
  return Response.json({ error: "internal_error" }, { status: 500, headers: noStore });
}

export function notFoundResponse(): Response {
  return Response.json({ error: "not_found" }, { status: 404, headers: noStore });
}

export function devRouteRejection(request: Request): Response | null {
  if (!devRoutesEnabled()) return notFoundResponse();
  const guard = checkSameOriginJson(request);
  if (!guard.ok) {
    return Response.json({ error: guard.reason }, { status: guard.status, headers: noStore });
  }
  return null;
}
