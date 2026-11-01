import { createHash, randomBytes, randomUUID } from "node:crypto";

export type AuthHeaders = Record<
  "App-Key" | "Nonce" | "Timestamp" | "Signature" | "X-Request-ID" | "Content-Type",
  string
>;

export function computeSignature(appSecret: string, nonce: string, timestamp: string): string {
  return createHash("sha1")
    .update(appSecret + nonce + timestamp)
    .digest("hex");
}

export function createNonce(): string {
  return randomBytes(8).toString("hex");
}

export function createRequestId(): string {
  return randomUUID().replaceAll("-", "");
}

export function buildAuthHeaders(input: {
  appKey: string;
  appSecret: string;
  nonce: string;
  timestamp: string;
  requestId: string;
}): AuthHeaders {
  return {
    "App-Key": input.appKey,
    Nonce: input.nonce,
    Timestamp: input.timestamp,
    Signature: computeSignature(input.appSecret, input.nonce, input.timestamp),
    "X-Request-ID": input.requestId,
    "Content-Type": "application/json",
  };
}
