const RESEND_URL = "https://api.resend.com/emails";

export class EmailSendError extends Error {
  override readonly name = "EmailSendError";

  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string | null,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export type SendEmailInput = {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

type ResendErrorBody = { name?: unknown; message?: unknown };

const RETRYABLE_CODES = new Set(["rate_limit_exceeded", "concurrent_idempotent_requests"]);

// Never put html or text into an error or a log line: they carry the magic-link token.
export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.apiKey}`,
    "Content-Type": "application/json",
    "User-Agent": "margin/0.1",
  };
  if (input.idempotencyKey) headers["Idempotency-Key"] = input.idempotencyKey;

  let response: Response;
  try {
    response = await fetchImpl(RESEND_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: input.from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      signal: AbortSignal.timeout(input.timeoutMs ?? 5000),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    throw new EmailSendError(
      timedOut ? "Email send timed out" : "Email network error",
      null,
      null,
      true,
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (response.ok) {
    const id = (body as { id?: unknown } | null)?.id;
    if (typeof id === "string") return { id };
    throw new EmailSendError("Unexpected email API response", response.status, null, false);
  }

  const error = (body ?? {}) as ResendErrorBody;
  const code = typeof error.name === "string" ? error.name : null;
  const detail = typeof error.message === "string" ? error.message : response.statusText;
  const retryable = response.status >= 500 || (code !== null && RETRYABLE_CODES.has(code));
  throw new EmailSendError(
    `Resend ${response.status} ${code ?? "unknown"}: ${detail}`,
    response.status,
    code,
    retryable,
  );
}
