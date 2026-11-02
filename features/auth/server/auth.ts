import "server-only";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { getIP } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import { MAGIC_LINK_TTL_SECONDS, sendMagicLinkEmail } from "@/features/auth/server/magic-link";
import { newUserId } from "@/features/auth/shared/ids";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { consumeRate } from "@/lib/rate-limit.server";

export class AuthNotConfiguredError extends Error {
  override readonly name = "AuthNotConfiguredError";

  constructor() {
    super("AUTH_SECRET must be set (openssl rand -base64 32)");
  }
}

export function googleEnabled(): boolean {
  return Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
}

function createAuth(secret: string) {
  const google =
    env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET
      ? {
          google: {
            clientId: env.AUTH_GOOGLE_ID,
            clientSecret: env.AUTH_GOOGLE_SECRET,
            prompt: "select_account" as const,
          },
        }
      : {};

  return betterAuth({
    baseURL: env.NEXT_PUBLIC_APP_URL,
    secret,
    database: prismaAdapter(db, { provider: "postgresql" }),
    telemetry: { enabled: false },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    user: {
      additionalFields: {
        nexconnUserId: { type: "string", required: false, input: false, unique: true },
        language: { type: "string", required: true, defaultValue: "en", input: false },
      },
    },
    socialProviders: google,
    rateLimit: {
      customStorage: { consume: (key, rule) => consumeRate(`ba:${key}`, rule) },
      // Defaults (3 per 10 s for /sign-in*, 5 per 60 s for magic links) would lock out a
      // class signing in together behind one campus NAT. Per-email and daily email limits
      // in magic-link.ts do the abuse control.
      customRules: {
        "/sign-in/social": { window: 60, max: 60 },
        "/sign-in/magic-link": { window: 60, max: 30 },
        "/magic-link/verify": { window: 60, max: 60 },
      },
    },
    advanced: {
      // Set to the client-IP header the production host overwrites (e.g. fly-client-ip) or
      // its proxy CIDRs; otherwise Better Auth trusts x-forwarded-for only when it has one hop.
      ipAddress: {
        ipAddressHeaders: env.AUTH_IP_HEADER ? [env.AUTH_IP_HEADER] : undefined,
        trustedProxies: env.AUTH_TRUSTED_PROXIES,
      },
    },
    databaseHooks: {
      user: {
        create: {
          // The Nexconn ID is reserved here, in the same INSERT; registration with Nexconn
          // happens on the first token request, so sign-in never depends on Nexconn.
          before: async () => {
            const id = newUserId();
            return { data: { id, nexconnUserId: id } };
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_TTL_SECONDS,
        storeToken: "hashed",
        sendMagicLink: ({ email, url }, ctx) =>
          sendMagicLinkEmail({
            email,
            url,
            ip: ctx
              ? getIP(ctx.request ?? ctx.headers ?? new Headers(), ctx.context.options)
              : null,
          }),
      }),
      nextCookies(), // must stay last
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

// Built on first use, not at import: betterAuth() validates the secret immediately, and
// `next build` in CI runs without AUTH_SECRET.
export function getAuth(): Auth {
  if (!instance) {
    if (!env.AUTH_SECRET) throw new AuthNotConfiguredError();
    instance = createAuth(env.AUTH_SECRET);
  }
  return instance;
}
