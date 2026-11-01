import { buildAuthHeaders, createNonce, createRequestId } from "@/features/nexconn/server/sign";

export class NexconnApiError extends Error {
  override readonly name = "NexconnApiError";

  constructor(
    readonly path: string,
    readonly httpStatus: number,
    readonly code: number | null,
    readonly requestId: string,
    message: string,
  ) {
    super(message);
  }
}

export type CallOptions = { retryOnFailover: boolean };

export type NexconnClientConfig = {
  appKey: string;
  appSecret: string;
  hosts: { primary: string; backup: string };
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  nonce?: () => string;
  requestId?: () => string;
};

export type NexconnClient = {
  call<T>(path: `/v4/${string}`, body: unknown, options?: CallOptions): Promise<T>;
  currentHost(): string;
};

type ResponseBody = { code?: unknown; result?: unknown; errorMessage?: unknown };

class FailoverSignal extends Error {}

export function createNexconnClient(config: NexconnClientConfig): NexconnClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? 5000;
  const now = config.now ?? Date.now;
  const nonce = config.nonce ?? createNonce;
  const requestId = config.requestId ?? createRequestId;
  let host: string = config.hosts.primary;

  function otherHost(used: string): string {
    return used === config.hosts.primary ? config.hosts.backup : config.hosts.primary;
  }

  function markFailed(used: string) {
    if (host === used) host = otherHost(used);
  }

  async function attempt<T>(target: string, path: string, body: unknown): Promise<T> {
    const id = requestId();
    const headers = buildAuthHeaders({
      appKey: config.appKey,
      appSecret: config.appSecret,
      nonce: nonce(),
      timestamp: String(now()),
      requestId: id,
    });

    let response: Response;
    try {
      response = await fetchImpl(`${target}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new FailoverSignal(error instanceof Error ? error.message : "network error", {
        cause: new NexconnApiError(path, 0, null, id, "Network error or timeout"),
      });
    }

    if (response.status >= 500) {
      throw new FailoverSignal(`HTTP ${response.status}`, {
        cause: new NexconnApiError(path, response.status, null, id, `HTTP ${response.status}`),
      });
    }

    let parsed: ResponseBody | null = null;
    try {
      parsed = (await response.json()) as ResponseBody;
    } catch {
      parsed = null;
    }

    const code = typeof parsed?.code === "number" ? parsed.code : null;
    if (response.status === 200 && code === 0) {
      return parsed?.result as T;
    }

    const detail =
      typeof parsed?.errorMessage === "string" ? parsed.errorMessage : "request failed";
    throw new NexconnApiError(path, response.status, code, id, `Nexconn ${path}: ${detail}`);
  }

  async function call<T>(
    path: `/v4/${string}`,
    body: unknown,
    options: CallOptions = { retryOnFailover: false },
  ): Promise<T> {
    const first = host;
    try {
      return await attempt<T>(first, path, body);
    } catch (error) {
      if (!(error instanceof FailoverSignal)) throw error;
      markFailed(first);
      if (!options.retryOnFailover) throw error.cause;
      const second = otherHost(first);
      try {
        return await attempt<T>(second, path, body);
      } catch (retryError) {
        if (retryError instanceof FailoverSignal) {
          markFailed(second);
          throw retryError.cause;
        }
        throw retryError;
      }
    }
  }

  return { call, currentHost: () => host };
}
