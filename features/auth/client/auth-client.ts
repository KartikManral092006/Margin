"use client";

import { createAuthClient } from "better-auth/client";
import { magicLinkClient } from "better-auth/client/plugins";

// baseURL defaults to window.location.origin, so the cookie host always matches the page.
export const authClient = createAuthClient({ plugins: [magicLinkClient()] });
