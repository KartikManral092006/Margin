import { describe, expect, it, vi } from "vitest";
import { EmailSendError, sendEmail } from "@/features/email/server/resend";

const input = {
  apiKey: "re_test",
  from: "Margin <login@mail.example.me>",
  to: "a@b.co",
  subject: "Sign in",
  html: "<p>secret-link</p>",
  text: "secret-link",
  idempotencyKey: "key-1",
};

function respond(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
}

async function failure(promise: Promise<unknown>): Promise<EmailSendError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(EmailSendError);
  return error as EmailSendError;
}

describe("sendEmail", () => {
  it("posts to Resend with auth, user agent and idempotency headers", async () => {
    const fetchImpl = respond(200, { id: "email-1" });
    await expect(sendEmail({ ...input, fetchImpl })).resolves.toEqual({ id: "email-1" });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test");
    expect(headers["User-Agent"]).toBe("margin/0.1");
    expect(headers["Idempotency-Key"]).toBe("key-1");
    expect(JSON.parse(String(init?.body))).toEqual({
      from: input.from,
      to: ["a@b.co"],
      subject: "Sign in",
      html: input.html,
      text: input.text,
    });
  });

  it("does not retry quota errors", async () => {
    const fetchImpl = respond(429, { name: "daily_quota_exceeded", message: "quota" });
    const error = await failure(sendEmail({ ...input, fetchImpl }));
    expect(error.code).toBe("daily_quota_exceeded");
    expect(error.status).toBe(429);
    expect(error.retryable).toBe(false);
  });

  it("marks server errors as retryable", async () => {
    const error = await failure(sendEmail({ ...input, fetchImpl: respond(500, {}) }));
    expect(error.retryable).toBe(true);
  });

  it("reports a network failure with no status", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    const error = await failure(sendEmail({ ...input, fetchImpl }));
    expect(error.status).toBeNull();
    expect(error.retryable).toBe(true);
  });

  it("never puts the email body in the error message", async () => {
    const error = await failure(sendEmail({ ...input, fetchImpl: respond(403, {}) }));
    expect(error.message).not.toContain("secret-link");
  });
});
