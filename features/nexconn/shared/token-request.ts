import { z } from "zod";
import { nexconnDisplayName } from "@/features/auth/shared/display-name";
import { DEV_TEST_USERS, type DevTestUser } from "@/features/nexconn/shared/config";
import { toNexconnId } from "@/features/nexconn/shared/ids";

// Strict: the body can never name a user. Identity comes from the session (or a dev user).
export const tokenRequestSchema = z
  .object({
    refresh: z.boolean().optional(),
    devUser: z.enum(DEV_TEST_USERS).optional(),
  })
  .strict();

export type TokenIdentity =
  | { ok: true; userId: string; name: string; backfill: boolean }
  | { ok: false; status: 401 | 404; error: string };

export function decideTokenIdentity(input: {
  devUser?: DevTestUser;
  devRoutesEnabled: boolean;
  sessionUser: { id: string; name: string; nexconnUserId: string | null } | null;
}): TokenIdentity {
  if (input.devUser) {
    if (!input.devRoutesEnabled) return { ok: false, status: 404, error: "not_found" };
    return { ok: true, userId: input.devUser, name: input.devUser, backfill: false };
  }
  if (!input.sessionUser) return { ok: false, status: 401, error: "unauthenticated" };

  const userId = input.sessionUser.nexconnUserId ?? toNexconnId(input.sessionUser.id);
  return {
    ok: true,
    userId,
    name: nexconnDisplayName({ name: input.sessionUser.name, nexconnUserId: userId }),
    backfill: input.sessionUser.nexconnUserId === null,
  };
}
