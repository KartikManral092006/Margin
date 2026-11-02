const MESSAGES: Record<string, string> = {
  INVALID_TOKEN: "That sign-in link expired or was already used. Request a new one.",
  EXPIRED_TOKEN: "That sign-in link expired or was already used. Request a new one.",
  TOO_MANY_REQUESTS: "Email sign-in is busy. Try again in a few minutes.",
  RATE_LIMITED: "Too many sign-in attempts. Wait a moment and try again.",
  EMAIL_QUOTA: "Email sign-in is busy. Try again later.",
  EMAIL_SEND_FAILED: "We couldn't send the email. Try again.",
  EMAIL_NOT_CONFIGURED: "Email sign-in isn't available here.",
  AUTH_NOT_CONFIGURED: "Sign-in isn't configured on this server yet.",
};

// Email problems where Google is a way out, but only when the Google button is shown.
const SUGGEST_GOOGLE = new Set([
  "TOO_MANY_REQUESTS",
  "EMAIL_QUOTA",
  "EMAIL_SEND_FAILED",
  "EMAIL_NOT_CONFIGURED",
]);

const GENERIC = "Something went wrong while signing in. Try again.";

export function signInErrorMessage(
  code: string | null | undefined,
  options: { google?: boolean } = {},
): string | null {
  if (!code) return null;
  const message = MESSAGES[code] ?? GENERIC;
  return options.google && SUGGEST_GOOGLE.has(code)
    ? `${message} Or continue with Google.`
    : message;
}

export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}
