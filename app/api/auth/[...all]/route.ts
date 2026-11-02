import { connection } from "next/server";
import { AuthNotConfiguredError, getAuth } from "@/features/auth/server/auth";
import {
  isSameOriginNavigation,
  MAGIC_LINK_CONFIRM_PATH,
  MAGIC_LINK_VERIFY_PATH,
} from "@/features/auth/shared/magic-link";
import { env } from "@/lib/env";

async function handle(request: Request): Promise<Response> {
  await connection();
  let auth: ReturnType<typeof getAuth>;
  try {
    auth = getAuth();
  } catch (error) {
    if (!(error instanceof AuthNotConfiguredError)) throw error;
    return Response.json(
      { error: "auth_not_configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const url = new URL(request.url);
  const appOrigin = new URL(env.NEXT_PUBLIC_APP_URL).origin;
  if (
    request.method === "GET" &&
    url.pathname === MAGIC_LINK_VERIFY_PATH &&
    !isSameOriginNavigation(request.headers, appOrigin)
  ) {
    // Not from our confirm page: show it instead of spending the token.
    return Response.redirect(new URL(`${MAGIC_LINK_CONFIRM_PATH}${url.search}`, appOrigin), 303);
  }

  return auth.handler(request);
}

export { handle as GET, handle as POST };
