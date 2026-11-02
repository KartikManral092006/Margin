export const MAGIC_LINK_VERIFY_PATH = "/api/auth/magic-link/verify";
export const MAGIC_LINK_CONFIRM_PATH = "/sign-in/confirm";

// The emailed link opens our confirm page instead of the verify endpoint, so mail scanners
// that prefetch links cannot spend the single-use token.
export function toConfirmUrl(verifyUrl: string): string {
  const url = new URL(verifyUrl);
  url.pathname = MAGIC_LINK_CONFIRM_PATH;
  return url.toString();
}

// The token may only be spent by a navigation that started on our own confirm page. A link
// opened from an email, another site or a scanner is sent to the confirm page instead, which
// blocks login CSRF (someone else's link signing you into their account).
export function isSameOriginNavigation(headers: Headers, appOrigin: string): boolean {
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite !== null) return fetchSite === "same-origin";

  // Browsers without Fetch Metadata: fall back to the Referer, which is same-origin by default.
  const referer = headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === appOrigin;
  } catch {
    return false;
  }
}
