import "server-only";
import { createHash } from "node:crypto";
import { APIError } from "better-auth/api";
import { renderMagicLinkEmail } from "@/features/auth/server/magic-link-email";
import { maskEmail } from "@/features/auth/shared/errors";
import { toConfirmUrl } from "@/features/auth/shared/magic-link";
import { EmailSendError, sendEmail } from "@/features/email/server/resend";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { consumeRate } from "@/lib/rate-limit.server";

export const MAGIC_LINK_TTL_SECONDS = 600;

const PER_EMAIL = { window: 900, max: 3 };
// Stops one client from spending the shared daily cap. Applied only when the client IP is
// known (see AUTH_IP_HEADER), so unknown IPs never share one bucket.
const PER_IP_DAILY = { window: 86_400, max: 10 };
// Resend Free allows 100 emails a day; keep headroom so overflow becomes a clear message.
const DAILY_GLOBAL = { window: 86_400, max: 90 };

function emailKey(email: string): string {
  return createHash("sha256").update(email).digest("hex").slice(0, 32);
}

export async function sendMagicLinkEmail(input: {
  email: string;
  url: string;
  ip: string | null;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const url = toConfirmUrl(input.url);

  const perEmail = await consumeRate(`ml:email:${emailKey(email)}`, PER_EMAIL);
  if (!perEmail.allowed) {
    throw new APIError("TOO_MANY_REQUESTS", {
      message: "Too many sign-in emails",
      code: "TOO_MANY_REQUESTS",
    });
  }

  if (!env.EMAIL_API_KEY || !env.EMAIL_FROM) {
    // The link is a credential: it may reach the log only on a developer's own machine.
    if (env.NODE_ENV === "development") {
      logger.warn(
        { to: maskEmail(email), magicLinkUrl: url },
        "EMAIL_API_KEY is not set: magic link logged instead of sent (development only)",
      );
      return;
    }
    throw new APIError("SERVICE_UNAVAILABLE", {
      message: "Email sign-in is not configured",
      code: "EMAIL_NOT_CONFIGURED",
    });
  }

  if (input.ip) {
    const perIp = await consumeRate(`ml:ip:${input.ip}`, PER_IP_DAILY);
    if (!perIp.allowed) {
      throw new APIError("TOO_MANY_REQUESTS", {
        message: "Too many sign-in emails",
        code: "TOO_MANY_REQUESTS",
      });
    }
  }

  const daily = await consumeRate("ml:daily", DAILY_GLOBAL);
  if (!daily.allowed) {
    throw new APIError("SERVICE_UNAVAILABLE", {
      message: "Email sign-in is busy",
      code: "EMAIL_QUOTA",
    });
  }

  const message = renderMagicLinkEmail({
    url,
    expiresInMinutes: MAGIC_LINK_TTL_SECONDS / 60,
  });
  const apiKey = env.EMAIL_API_KEY;
  const send = () =>
    sendEmail({
      apiKey,
      from: `Margin <${env.EMAIL_FROM}>`,
      to: email,
      ...message,
      // Same key on the retry, so Resend never delivers two different links.
      idempotencyKey: createHash("sha256").update(url).digest("hex"),
    });

  try {
    await send().catch((error: unknown) =>
      error instanceof EmailSendError && error.retryable ? send() : Promise.reject(error),
    );
  } catch (error) {
    const code = error instanceof EmailSendError ? error.code : null;
    logger.error(
      { to: maskEmail(email), status: error instanceof EmailSendError ? error.status : null, code },
      "magic link email failed",
    );
    const quota = code === "daily_quota_exceeded" || code === "monthly_quota_exceeded";
    throw new APIError("SERVICE_UNAVAILABLE", {
      message: "Could not send the sign-in email",
      code: quota ? "EMAIL_QUOTA" : "EMAIL_SEND_FAILED",
    });
  }
}
