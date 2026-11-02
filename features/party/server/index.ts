import "server-only";
import { createOpenChannel, destroyOpenChannels, isCode } from "@/features/nexconn/server/api";
import { getNexconn, NexconnNotConfiguredError } from "@/features/nexconn/server";
import { partyStateSchema, type PartyState } from "@/features/party/shared/sync";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

const STATE_TTL_SECONDS = 600;
const stateKey = (partyId: string) => `party:state:${partyId}`;

export type StoredState = PartyState & { savedAt: number };

// The host's latest state: late joiners sync from it at once, and viewers without a live
// Nexconn connection poll it.
export async function saveState(partyId: string, state: PartyState, savedAt: number) {
  await redis.set(
    stateKey(partyId),
    JSON.stringify({ ...state, savedAt }),
    "EX",
    STATE_TTL_SECONDS,
  );
}

// Null when there is no (valid) state. A Redis error throws: callers must not read it as
// "the host has gone quiet".
export async function readState(partyId: string): Promise<StoredState | null> {
  const raw = await redis.get(stateKey(partyId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredState;
    const state = partyStateSchema.safeParse({
      action: parsed.action,
      tSec: parsed.tSec,
      playing: parsed.playing,
      rate: parsed.rate,
      hostSentAt: parsed.hostSentAt,
    });
    return state.success ? { ...state.data, savedAt: parsed.savedAt } : null;
  } catch {
    return null;
  }
}

export async function clearState(partyId: string) {
  await redis.del(stateKey(partyId)).catch(() => 0);
}

const CHANNEL_EXISTS = 23435;
const CHANNEL_RETRY_DELAYS_MS = [0, 2000, 5000];

// The party's open channel (party chat and MG:Sync), created if missing ("already exists" counts
// as done, so this is safe to repeat). Parties work without it: viewers then follow the host by
// polling the saved state.
export async function openPartyChannel(channelId: string): Promise<boolean> {
  for (const delay of CHANNEL_RETRY_DELAYS_MS) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      await createOpenChannel(getNexconn(), { channelId, destroyType: 0, ttlMinutes: 60 });
      return true;
    } catch (error) {
      if (isCode(error, CHANNEL_EXISTS)) return true;
      if (error instanceof NexconnNotConfiguredError) return false;
      logger.warn({ err: error, channelId }, "party channel not created");
    }
  }
  return false;
}

export async function closePartyChannel(channelId: string) {
  try {
    await destroyOpenChannels(getNexconn(), { channelIds: [channelId] });
  } catch (error) {
    logger.warn({ err: error, channelId }, "party channel not destroyed");
  }
}
