export type RequestGuardResult = { ok: true } | { ok: false; status: 403 | 415; reason: string };

function hostOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

export function checkSameOriginJson(request: Request): RequestGuardResult {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin") {
    return { ok: false, status: 403, reason: "cross_site" };
  }

  const origin = request.headers.get("origin");
  if (origin !== null) {
    const host = request.headers.get("host");
    if (!host || hostOf(origin) !== host) {
      return { ok: false, status: 403, reason: "origin_mismatch" };
    }
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return { ok: false, status: 415, reason: "json_required" };
  }

  return { ok: true };
}
