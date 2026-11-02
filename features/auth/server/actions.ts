"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/features/auth/server/auth";
import { SIGN_IN_PATH } from "@/features/auth/shared/routes";
import { logger } from "@/lib/logger";

export async function signOutAction(): Promise<void> {
  try {
    // Deletes the session row; nextCookies() forwards the expired cookie to the response.
    await getAuth().api.signOut({ headers: await headers() });
  } catch (error) {
    logger.warn({ err: error }, "sign-out without a valid session");
  }
  redirect(SIGN_IN_PATH);
}
