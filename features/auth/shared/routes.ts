export const SIGN_IN_PATH = "/sign-in";
export const DEFAULT_AFTER_SIGN_IN = "/home";

// Keep in sync with the matcher in proxy.ts (tests/unit/proxy.test.ts enforces it).
export const PROTECTED_PREFIXES = ["/home", "/lectures"] as const;

const PARSE_BASE = "http://margin.invalid";
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => isUnder(pathname, prefix));
}

// Only same-origin relative paths survive; anything else falls back. This guards every
// redirect we build from a callbackURL (proxy, sign-in page, session helpers).
export function safeCallbackPath(raw: unknown, fallback: string = DEFAULT_AFTER_SIGN_IN): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  if (CONTROL_CHARS.test(raw)) return fallback;

  let url: URL;
  try {
    url = new URL(raw, PARSE_BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== PARSE_BASE) return fallback;
  // Parsing removes dot segments, so "/.//evil.com" only becomes "//evil.com" here.
  if (url.pathname.startsWith("//")) return fallback;
  if (isUnder(url.pathname, SIGN_IN_PATH) || isUnder(url.pathname, "/api")) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function signInRedirectPath(returnTo: string): string {
  return `${SIGN_IN_PATH}?callbackURL=${encodeURIComponent(safeCallbackPath(returnTo))}`;
}
