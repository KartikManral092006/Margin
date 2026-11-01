export const NEXCONN_ID_RE = /^[A-Za-z0-9]{1,64}$/;

export function isNexconnId(value: string): boolean {
  return NEXCONN_ID_RE.test(value);
}

export function toNexconnId(appId: string): string {
  const id = appId.replace(/[^A-Za-z0-9]/g, "");
  if (!isNexconnId(id)) {
    throw new Error(`Cannot map "${appId}" to a Nexconn ID (letters and digits, 1-64 chars)`);
  }
  return id;
}
