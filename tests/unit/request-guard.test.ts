import { describe, expect, it } from "vitest";
import { checkSameOriginJson } from "@/lib/request-guard";

function request(headers: Record<string, string>) {
  return new Request("http://localhost:3000/api/x", { method: "POST", headers });
}

const json = { "content-type": "application/json", host: "localhost:3000" };

describe("checkSameOriginJson", () => {
  it("accepts a same-origin JSON request from the browser", () => {
    expect(
      checkSameOriginJson(
        request({ ...json, origin: "http://localhost:3000", "sec-fetch-site": "same-origin" }),
      ),
    ).toEqual({ ok: true });
  });

  it("accepts a JSON request without browser headers (curl, tests)", () => {
    expect(checkSameOriginJson(request(json))).toEqual({ ok: true });
  });

  it("rejects cross-site browser requests", () => {
    expect(checkSameOriginJson(request({ ...json, "sec-fetch-site": "cross-site" }))).toMatchObject(
      {
        ok: false,
        status: 403,
      },
    );
  });

  it("rejects a mismatched Origin", () => {
    expect(checkSameOriginJson(request({ ...json, origin: "https://evil.example" }))).toMatchObject(
      {
        ok: false,
        status: 403,
      },
    );
  });

  it("rejects non-JSON bodies such as form or text/plain posts", () => {
    expect(
      checkSameOriginJson(request({ host: "localhost:3000", "content-type": "text/plain" })),
    ).toMatchObject({ ok: false, status: 415 });
  });
});
