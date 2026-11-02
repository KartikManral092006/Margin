const ROOM_ERRORS: Record<string, string> = {
  invalid_url: "That doesn't look like a YouTube video link.",
  video_not_found: "We couldn't find that video on YouTube.",
  video_unavailable: "This video is private or can't be embedded.",
  youtube_unavailable: "YouTube didn't answer. Try again in a moment.",
  rate_limited: "You've opened a lot of new rooms today. Try again later.",
  auth_not_configured: "Sign-in isn't configured on this server yet.",
};

export function roomErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return ROOM_ERRORS[code] ?? "Something went wrong. Try again.";
}
