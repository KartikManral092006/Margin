import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "@/features/auth/server/auth";
import { signInRedirectPath } from "@/features/auth/shared/routes";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  nexconnUserId: string | null;
  language: string;
};

export async function getSessionUserFromHeaders(
  requestHeaders: Headers,
): Promise<SessionUser | null> {
  // Refresh is off here: a Server Component cannot write the refreshed cookie, so the DB
  // expiry would move without it. SessionRefresher refreshes through the route handler.
  const session = await getAuth().api.getSession({
    headers: requestHeaders,
    query: { disableRefresh: true },
  });
  if (!session) return null;
  const { user } = session;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
    nexconnUserId: user.nexconnUserId ?? null,
    language: user.language,
  };
}

// Callers in pages must have awaited connection() first (Cache Components).
export const getOptionalSession = cache(async (): Promise<SessionUser | null> =>
  getSessionUserFromHeaders(await headers()),
);

// The real check behind every protected page; proxy.ts only looks for the cookie.
export const verifySession = cache(async (returnTo: string): Promise<SessionUser> => {
  const user = await getOptionalSession();
  if (!user) redirect(signInRedirectPath(returnTo));
  return user;
});
