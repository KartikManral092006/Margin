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

export const MAX_JSON_BYTES = 8192;
export const TOO_LARGE = Symbol("too_large");

// Reads at most maxBytes before parsing, so a huge body can't be buffered. Returns
// "too_large" (send 413) or the parsed value, or null when the body isn't valid JSON.
export async function readJsonBody(
  request: Request,
  maxBytes: number = MAX_JSON_BYTES,
): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return TOO_LARGE;
  if (!request.body) return null;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return TOO_LARGE;
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
  } catch {
    return null;
  }
}
