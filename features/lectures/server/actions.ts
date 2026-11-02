"use server";

import { redirect } from "next/navigation";
import { AuthNotConfiguredError } from "@/features/auth/server/auth";
import { getOptionalSession } from "@/features/auth/server/session";
import { signInRedirectPath } from "@/features/auth/shared/routes";
import { openDeps } from "@/features/lectures/server";
import { openPublicLecture } from "@/features/lectures/server/open";
import { roomErrorMessage } from "@/features/lectures/shared/messages";
import { parseStartSec, YOUTUBE_ID_RE } from "@/features/lectures/shared/youtube";
import { consumeRate } from "@/lib/rate-limit.server";

export type CreateRoomState = { error: string | null };

// Form action on /lectures/new. A server action redirects with a real 303, even without JS.
export async function createLectureAction(
  _previous: CreateRoomState,
  formData: FormData,
): Promise<CreateRoomState> {
  const v = formData.get("v");
  const t = formData.get("t");
  if (typeof v !== "string" || !YOUTUBE_ID_RE.test(v)) {
    return { error: roomErrorMessage("invalid_url") };
  }
  const startSec = typeof t === "string" ? parseStartSec(t) : null;
  const query = startSec ? `t=${startSec}` : "";

  let user;
  try {
    user = await getOptionalSession();
  } catch (error) {
    if (error instanceof AuthNotConfiguredError) {
      return { error: roomErrorMessage("auth_not_configured") };
    }
    throw error;
  }
  if (!user) redirect(signInRedirectPath(`/open?v=${v}${query ? `&${query}` : ""}`));

  const limit = await consumeRate(`lec:open:${user.id}`, { window: 600, max: 30 });
  if (!limit.allowed) return { error: roomErrorMessage("rate_limited") };

  const result = await openPublicLecture(openDeps(), user.id, v);
  if (!result.ok) return { error: roomErrorMessage(result.error) };

  redirect(`/lectures/${result.lecture.id}${query ? `?${query}` : ""}`);
}
