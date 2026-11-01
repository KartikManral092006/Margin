import { NextResponse, type NextRequest } from "next/server";

function devRoutesAllowed(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.NEXCONN_DEV_ROUTES === "1";
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isDevRoute = pathname === "/dev" || pathname.startsWith("/dev/");
  if (isDevRoute && !devRoutesAllowed()) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dev/:path*"],
};
