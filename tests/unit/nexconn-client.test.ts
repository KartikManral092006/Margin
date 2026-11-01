import { describe, expect, it, vi } from "vitest";
import { createNexconnClient, NexconnApiError } from "@/features/nexconn/server/client";
import { computeSignature } from "@/features/nexconn/server/sign";

const hosts = { primary: "https://primary.test", backup: "https://backup.test" };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setup(fetchImpl: typeof fetch) {
  return createNexconnClient({
    appKey: "key",
    appSecret: "secret",
    hosts,
    fetchImpl,
    now: () => 1700000000000,
    nonce: () => "nonce1",
    requestId: () => "req1",
  });
}

describe("createNexconnClient", () => {
  it("returns result on HTTP 200 with code 0", async () => {
    const fetchImpl = vi.fn(async () => json(200, { code: 0, result: { ok: true } }));
    await expect(setup(fetchImpl).call("/v4/test", {})).resolves.toEqual({ ok: true });
  });

  it("throws NexconnApiError with the business code on code != 0", async () => {
    const fetchImpl = vi.fn(async () => json(200, { code: 1004, errorMessage: "bad sig" }));
    const error = await setup(fetchImpl)
      .call("/v4/test", {})
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NexconnApiError);
    expect(error).toMatchObject({ code: 1004, httpStatus: 200, requestId: "req1" });
  });

  it("throws with httpStatus 401 on auth failure", async () => {
    const fetchImpl = vi.fn(async () => json(401, { code: 1004 }));
    await expect(setup(fetchImpl).call("/v4/test", {})).rejects.toMatchObject({ httpStatus: 401 });
  });

  it("signs the request and posts JSON", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json(200, { code: 0 }));
    await setup(fetchImpl).call("/v4/test", { userId: "u1" });
    const [url, init] = fetchImpl.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(url).toBe("https://primary.test/v4/test");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ userId: "u1" }));
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Signature).toBe(computeSignature("secret", "nonce1", "1700000000000"));
  });

  it("fails over to the backup host and retries when allowed", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"))
      .mockResolvedValueOnce(json(200, { code: 0, result: "from-backup" }));
    const client = setup(fetchImpl);
    await expect(client.call("/v4/test", {}, { retryOnFailover: true })).resolves.toBe(
      "from-backup",
    );
    expect(fetchImpl.mock.calls[1]![0]).toBe("https://backup.test/v4/test");
    expect(client.currentHost()).toBe(hosts.backup);
  });

  it("switches host but does not resend when retry is not allowed", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError("fetch failed"));
    const client = setup(fetchImpl);
    await expect(client.call("/v4/test", {})).rejects.toMatchObject({ httpStatus: 0, code: null });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(client.currentHost()).toBe(hosts.backup);
  });

  it("stays on the backup when concurrent requests fail on the primary", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) =>
      String(input).startsWith(hosts.primary)
        ? Promise.reject(new TypeError("fetch failed"))
        : json(200, { code: 0, result: "ok" }),
    );
    const client = setup(fetchImpl);
    const results = await Promise.allSettled([
      client.call("/v4/a", {}),
      client.call("/v4/b", {}),
      client.call("/v4/c", {}, { retryOnFailover: true }),
    ]);
    expect(client.currentHost()).toBe(hosts.backup);
    expect(results[2]).toEqual({ status: "fulfilled", value: "ok" });
    const retried = fetchImpl.mock.calls.filter(([url]) => String(url).endsWith("/v4/c"));
    expect(retried.map(([url]) => String(url))).toEqual([
      "https://primary.test/v4/c",
      "https://backup.test/v4/c",
    ]);
    await client.call("/v4/d", {});
    expect(String(fetchImpl.mock.calls.at(-1)![0])).toBe("https://backup.test/v4/d");
  });

  it("treats HTTP 5xx as a failover condition", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(504, {}))
      .mockResolvedValueOnce(json(200, { code: 0, result: 1 }));
    await expect(setup(fetchImpl).call("/v4/test", {}, { retryOnFailover: true })).resolves.toBe(1);
  });
});
