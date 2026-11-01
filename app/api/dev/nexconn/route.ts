import { randomUUID } from "node:crypto";
import { connection } from "next/server";
import { z } from "zod";
import { getNexconn } from "@/features/nexconn/server";
import {
  createGroup,
  joinGroup,
  sendGroupMessage,
  sendGroupStreamChunk,
  setMessageMetadata,
} from "@/features/nexconn/server/api";
import { devRouteRejection, nexconnErrorResponse } from "@/features/nexconn/server/errors";
import { getChatToken } from "@/features/nexconn/server/tokens";
import {
  DEV_LECTURE_CHANNEL_ID,
  SYSTEM_USER_ID,
  SYSTEM_USER_NAME,
} from "@/features/nexconn/shared/config";
import { NEXCONN_ID_RE } from "@/features/nexconn/shared/ids";
import {
  encodeContent,
  MG,
  momentMetadata,
  type MomentPayload,
  type MomentUpdatePayload,
} from "@/features/nexconn/shared/messages";

const userId = z.string().regex(NEXCONN_ID_RE);

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup"), userIds: z.array(userId).min(1).max(10) }),
  z.object({
    action: z.literal("moment"),
    fromUserId: userId,
    text: z.string().trim().min(1).max(2000),
    tSec: z.number().nonnegative(),
  }),
  z.object({
    action: z.literal("metadata"),
    messageId: z.string().min(1),
    upvotes: z.number().int().nonnegative(),
  }),
  z.object({
    action: z.literal("momentUpdate"),
    momentId: z.string().min(1),
    upvotes: z.number().int().nonnegative(),
  }),
  z.object({ action: z.literal("stream") }),
]);

const STREAM_CHUNKS = [
  "**Closures** keep access to the variables of the function that created them, ",
  "even after that outer function has returned.\n\n",
  "In the lecture at 12:34, `makeCounter()` returns an inner function ",
  "that still reads and updates `count`.\n\n",
  "Each call to `makeCounter()` creates a *new* `count`, ",
  "so two counters never share state.",
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type DevAction = z.infer<typeof actionSchema>;

async function run(action: DevAction) {
  const client = getNexconn();

  switch (action.action) {
    case "setup": {
      await getChatToken({ userId: SYSTEM_USER_ID, name: SYSTEM_USER_NAME });
      const group = await createGroup(client, {
        channelId: DEV_LECTURE_CHANNEL_ID,
        name: "Dev lecture",
        owner: SYSTEM_USER_ID,
        userIds: action.userIds,
      });
      if (!group.created) {
        await joinGroup(client, { channelId: DEV_LECTURE_CHANNEL_ID, userIds: action.userIds });
      }
      return { created: group.created, channelId: DEV_LECTURE_CHANNEL_ID };
    }

    case "moment": {
      const payload: MomentPayload = {
        momentId: randomUUID().replaceAll("-", ""),
        lectureId: DEV_LECTURE_CHANNEL_ID,
        tSec: action.tSec,
        text: action.text,
        parentId: null,
      };
      const result = await sendGroupMessage(client, {
        fromUserId: action.fromUserId,
        toChannelIds: [DEV_LECTURE_CHANNEL_ID],
        messageType: MG.Moment,
        content: encodeContent(payload),
        isEchoToSender: 1,
        hasMetadata: true,
        metadata: momentMetadata({ upvotes: 0, status: "open", pinned: false }),
      });
      return { momentId: payload.momentId, messageId: result.messageIds[0]?.messageId ?? null };
    }

    case "metadata": {
      await setMessageMetadata(client, {
        messageId: action.messageId,
        userId: SYSTEM_USER_ID,
        channelType: 3,
        channelId: DEV_LECTURE_CHANNEL_ID,
        metadata: { upvotes: String(action.upvotes) },
        isEchoToSender: 1,
      });
      return { messageId: action.messageId, upvotes: action.upvotes };
    }

    case "momentUpdate": {
      const payload: MomentUpdatePayload = {
        momentId: action.momentId,
        upvotes: action.upvotes,
        status: "open",
        pinned: false,
      };
      const result = await sendGroupMessage(client, {
        fromUserId: SYSTEM_USER_ID,
        toChannelIds: [DEV_LECTURE_CHANNEL_ID],
        messageType: MG.MomentUpdate,
        content: encodeContent(payload),
      });
      return { messageId: result.messageIds[0]?.messageId ?? null };
    }

    case "stream": {
      let messageId: string | undefined;
      for (const [index, text] of STREAM_CHUNKS.entries()) {
        const first = index === 0;
        const result = await sendGroupStreamChunk(client, {
          fromUserId: SYSTEM_USER_ID,
          toChannelId: DEV_LECTURE_CHANNEL_ID,
          content: {
            content: text,
            seq: index + 1,
            complete: index === STREAM_CHUNKS.length - 1,
            ...(first ? { type: "markdown" as const } : { messageId }),
          },
        });
        if (first) {
          messageId = result.messageId;
          if (!messageId) throw new Error("First stream chunk returned no messageId");
        }
        if (index < STREAM_CHUNKS.length - 1) await sleep(300);
      }
      return { messageId, chunks: STREAM_CHUNKS.length };
    }
  }
}

export async function POST(request: Request) {
  await connection();
  const rejection = devRouteRejection(request);
  if (rejection) return rejection;

  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    return Response.json(await run(parsed.data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return nexconnErrorResponse(error);
  }
}
