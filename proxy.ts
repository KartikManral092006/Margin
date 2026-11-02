import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { isProtectedPath, signInRedirectPath } from "@/features/auth/shared/routes";

function devRoutesAllowed(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.NEXCONN_DEV_ROUTES === "1";
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isDevRoute = pathname === "/dev" || pathname.startsWith("/dev/");
  if (isDevRoute && !devRoutesAllowed()) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  // Optimistic check: the cookie exists. Pages verify the session itself (verifySession).
  // Never redirect /sign-in away here: a stale cookie would loop between the two pages.
  if (isProtectedPath(pathname) && getSessionCookie(request) === null) {
    return NextResponse.redirect(new URL(signInRedirectPath(`${pathname}${search}`), request.url));
  }
  return NextResponse.next();
}

// Literal values only. Must cover PROTECTED_PREFIXES (tests/unit/proxy.test.ts).
export const config = {
  matcher: ["/dev/:path*", "/home/:path*"],
};
