import "server-only";
import { createNexconnClient, type NexconnClient } from "@/features/nexconn/server/client";
import { NEXCONN_AREAS, type NexconnArea } from "@/features/nexconn/shared/config";
import { env } from "@/lib/env";

export class NexconnNotConfiguredError extends Error {
  override readonly name = "NexconnNotConfiguredError";

  constructor() {
    super("NEXCONN_APP_KEY and NEXCONN_APP_SECRET must be set");
  }
}

let client: NexconnClient | undefined;

function credentials(): { appKey: string; appSecret: string } {
  const appKey = env.NEXCONN_APP_KEY;
  const appSecret = env.NEXCONN_APP_SECRET;
  if (!appKey || !appSecret) throw new NexconnNotConfiguredError();
  return { appKey, appSecret };
}

export function getNexconn(): NexconnClient {
  if (!client) {
    client = createNexconnClient({ ...credentials(), hosts: NEXCONN_AREAS[env.NEXCONN_AREA] });
  }
  return client;
}

export function nexconnPublicConfig(): { appKey: string; area: NexconnArea } {
  return { appKey: credentials().appKey, area: env.NEXCONN_AREA };
}

export function devRoutesEnabled(): boolean {
  return env.NODE_ENV !== "production" && env.NEXCONN_DEV_ROUTES === "1";
}
