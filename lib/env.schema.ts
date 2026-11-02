import { z } from "zod";

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const serverEnvObject = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  NEXT_PUBLIC_APP_URL: z.url({ protocol: /^https?$/ }),
  AUTH_SECRET: optional(z.string().min(32)),
  AUTH_GOOGLE_ID: optional(z.string().min(1)),
  AUTH_GOOGLE_SECRET: optional(z.string().min(1)),
  AUTH_IP_HEADER: optional(z.string().regex(/^[a-z0-9-]+$/, "lowercase header name")),
  AUTH_TRUSTED_PROXIES: optional(
    z
      .string()
      .min(1)
      .transform((value) => value.split(",").map((entry) => entry.trim())),
  ),
  EMAIL_API_KEY: optional(z.string().min(1)),
  EMAIL_FROM: optional(z.email()),
  NEXCONN_APP_KEY: optional(z.string().min(1)),
  NEXCONN_APP_SECRET: optional(z.string().min(1)),
  NEXCONN_AREA: z.enum(["SG", "NA", "SA"]).default("SG"),
  NEXCONN_DEV_ROUTES: optional(z.enum(["0", "1"])),
  AI_API_KEY: optional(z.string().min(1)),
});

// Keys stay optional (CI builds without them); only half-configured pairs are rejected.
export const serverEnvSchema = serverEnvObject.superRefine((env, ctx) => {
  if (Boolean(env.AUTH_GOOGLE_ID) !== Boolean(env.AUTH_GOOGLE_SECRET)) {
    ctx.addIssue({
      code: "custom",
      path: ["AUTH_GOOGLE_SECRET"],
      message: "AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET must be set together",
    });
  }
  if (env.EMAIL_API_KEY && !env.EMAIL_FROM) {
    ctx.addIssue({
      code: "custom",
      path: ["EMAIL_FROM"],
      message: "EMAIL_FROM is required when EMAIL_API_KEY is set",
    });
  }
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${problems}`);
  }
  return result.data;
}

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url({ protocol: /^https?$/ }),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
