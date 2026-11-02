"use client";

import { useEffect } from "react";
import { authClient } from "@/features/auth/client/auth-client";

// Server Components read the session with refresh disabled because they cannot set cookies.
// This one request per page load goes through the auth route handler, which extends the
// session and re-issues the cookie once a day, so active users stay signed in.
export function SessionRefresher() {
  useEffect(() => {
    void authClient.getSession().catch(() => {});
  }, []);
  return null;
}
