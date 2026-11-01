import { describe, expect, it } from "vitest";
import {
  buildAuthHeaders,
  computeSignature,
  createNonce,
  createRequestId,
} from "@/features/nexconn/server/sign";

describe("computeSignature", () => {
  it("hashes secret + nonce + timestamp in that order as lowercase SHA-1 hex", () => {
    expect(computeSignature("a", "b", "c")).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
  });

  it("matches a locally computed vector for the docs placeholder inputs", () => {
    expect(computeSignature("your-own-app-secret", "14314", "1408710653000")).toBe(
      "7226f13eb94356169e9778e27d5539df875cbec3",
    );
  });
});

describe("createNonce", () => {
  it("never exceeds 18 characters", () => {
    for (let i = 0; i < 1000; i++) expect(createNonce().length).toBeLessThanOrEqual(18);
  });
});

describe("createRequestId", () => {
  it("is 32 lowercase hex characters", () => {
    expect(createRequestId()).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("buildAuthHeaders", () => {
  it("returns every required header with string values", () => {
    const headers = buildAuthHeaders({
      appKey: "key",
      appSecret: "secret",
      nonce: "n1",
      timestamp: "1700000000000",
      requestId: "r1",
    });
    expect(headers).toEqual({
      "App-Key": "key",
      Nonce: "n1",
      Timestamp: "1700000000000",
      Signature: computeSignature("secret", "n1", "1700000000000"),
      "X-Request-ID": "r1",
      "Content-Type": "application/json",
    });
  });
});
