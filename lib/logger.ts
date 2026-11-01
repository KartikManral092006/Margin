import "server-only";
import pino from "pino";
import { env } from "@/lib/env";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "margin" },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers.signature",
      "*.token",
      "*.secret",
      "*.accessToken",
      "*.appSecret",
      "*.signature",
    ],
    censor: "[redacted]",
  },
});

export function requestLogger(requestId: string) {
  return logger.child({ requestId });
}
