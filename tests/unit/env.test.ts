import { describe, expect, it } from "vitest";
import { clientEnvSchema, parseServerEnv } from "@/lib/env.schema";

const valid = {
  DATABASE_URL: "postgresql://margin:margin@localhost:5435/margin",
  REDIS_URL: "redis://localhost:6380",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
};

describe("parseServerEnv", () => {
  it("accepts the minimal Day 1 variables and applies defaults", () => {
    const env = parseServerEnv(valid);
    expect(env.NODE_ENV).toBe("development");
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.NEXCONN_APP_SECRET).toBeUndefined();
  });

  it("rejects a missing DATABASE_URL", () => {
    const { DATABASE_URL: _omitted, ...rest } = valid;
    expect(() => parseServerEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("rejects a database URL that is not Postgres", () => {
    expect(() => parseServerEnv({ ...valid, DATABASE_URL: "mysql://localhost/margin" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("rejects a malformed Redis URL", () => {
    expect(() => parseServerEnv({ ...valid, REDIS_URL: "not a url" })).toThrow(/REDIS_URL/);
  });

  it("treats empty optional secrets as unset", () => {
    const env = parseServerEnv({ ...valid, NEXCONN_APP_SECRET: "", AI_API_KEY: "" });
    expect(env.NEXCONN_APP_SECRET).toBeUndefined();
    expect(env.AI_API_KEY).toBeUndefined();
  });

  it("rejects an AUTH_SECRET shorter than 32 characters", () => {
    expect(() => parseServerEnv({ ...valid, AUTH_SECRET: "too-short" })).toThrow(/AUTH_SECRET/);
  });

  it("never echoes secret values in the error message", () => {
    const secret = "s3cr3t-value-that-must-not-leak";
    expect(() => parseServerEnv({ ...valid, AUTH_SECRET: secret, REDIS_URL: "" })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(secret) }),
    );
  });
});

describe("Nexconn settings", () => {
  it("defaults NEXCONN_AREA to SG and rejects unknown areas", () => {
    expect(parseServerEnv(valid).NEXCONN_AREA).toBe("SG");
    expect(() => parseServerEnv({ ...valid, NEXCONN_AREA: "XX" })).toThrow(/NEXCONN_AREA/);
  });

  it("only accepts 0 or 1 for NEXCONN_DEV_ROUTES", () => {
    expect(parseServerEnv({ ...valid, NEXCONN_DEV_ROUTES: "1" }).NEXCONN_DEV_ROUTES).toBe("1");
    expect(() => parseServerEnv({ ...valid, NEXCONN_DEV_ROUTES: "yes" })).toThrow(
      /NEXCONN_DEV_ROUTES/,
    );
  });
});

describe("clientEnvSchema", () => {
  it("only exposes public variables", () => {
    const parsed = clientEnvSchema.parse({ ...valid, NEXCONN_APP_SECRET: "secret" });
    expect(Object.keys(parsed)).toEqual(["NEXT_PUBLIC_APP_URL"]);
  });
});
