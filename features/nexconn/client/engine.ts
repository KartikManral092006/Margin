import type * as NexconnChat from "@nexconn/chat";
import type { NCChatUIApplication } from "@nexconn/chatui";
import { devHooks } from "@/features/nexconn/client/dev-hooks";
import { chatUIRegistrations, MG_REGISTRATIONS } from "@/features/nexconn/client/registrations";
import { ClientCode } from "@/features/nexconn/shared/codes";
import type { NexconnArea } from "@/features/nexconn/shared/config";

export type ChatModule = typeof NexconnChat;
export type ChatMessage = NexconnChat.Message<Record<string, unknown>>;

export type NexconnEvent = { id: number; at: number; kind: string; data: unknown };

type Listener = (event: NexconnEvent) => void;

type ClientStore = {
  listeners: Set<Listener>;
  eventId: number;
  received: Map<string, ChatMessage>;
  engine: Engine | null;
  session: Promise<NexconnSession> | null;
};

const store: ClientStore = ((globalThis as { __marginNexconn?: ClientStore }).__marginNexconn ??= {
  listeners: new Set(),
  eventId: 0,
  received: new Map(),
  engine: null,
  session: null,
});

export const nexconnEvents = {
  subscribe(listener: Listener): () => void {
    store.listeners.add(listener);
    return () => store.listeners.delete(listener);
  },
  emit(kind: string, data: unknown) {
    const event = { id: ++store.eventId, at: Date.now(), kind, data };
    for (const listener of store.listeners) listener(event);
  },
};

export function getReceivedMessage(messageId: string): ChatMessage | undefined {
  return store.received.get(messageId);
}

export function describeMessage(message: ChatMessage) {
  return {
    messageId: message.messageId,
    messageType: message.messageType,
    channelId: message.channelIdentifier.channelId,
    channelType: message.channelIdentifier.channelType,
    senderUserId: message.senderUserId,
    sentTime: message.sentTime,
    direction: message.direction,
    contentType: typeof message.content,
    content: message.content,
    metadata: Object.fromEntries(message.metadata ?? new Map()),
  };
}

type TokenResponse = { appKey: string; area: NexconnArea; userId: string; accessToken: string };

export class NexconnConnectError extends Error {
  override readonly name = "NexconnConnectError";

  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

async function fetchToken(userId: string, name: string, refresh: boolean): Promise<TokenResponse> {
  const response = await fetch("/api/nexconn/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, name, refresh }),
  });
  if (!response.ok) {
    throw new Error(`Token request failed (${response.status}): ${await response.text()}`);
  }
  return (await response.json()) as TokenResponse;
}

function addHandlers(chat: ChatModule) {
  const { NCEngine } = chat;

  NCEngine.addConnectionStatusHandler(
    "margin",
    new chat.ConnectionStatusHandler({
      onConnectionStatusChanged({ status, code }) {
        nexconnEvents.emit("connection", { status, code });
      },
    }),
  );

  NCEngine.addMessageHandler(
    "margin",
    new chat.MessageHandler({
      onMessageReceived({ messages }) {
        for (const message of messages as ChatMessage[]) {
          store.received.set(message.messageId, message);
          nexconnEvents.emit("message", describeMessage(message));
        }
      },
      onMessageMetadataUpdated({ messageId, channelIdentifier, metadata }) {
        nexconnEvents.emit("metadataUpdated", {
          messageId,
          channelId: channelIdentifier.channelId,
          metadata,
        });
      },
      onMessageMetadataDeleted(event) {
        nexconnEvents.emit("metadataDeleted", event);
      },
      onStreamMessageRequestInit({ messageId }) {
        nexconnEvents.emit("streamInit", { messageId });
      },
      onStreamMessageRequestDelta({ messageId, chunkInfo }) {
        nexconnEvents.emit("streamDelta", {
          messageId,
          chunk: chunkInfo.content,
          text: chunkInfo.messageContent,
        });
      },
      onStreamMessageRequestComplete({ messageId, code }) {
        nexconnEvents.emit("streamComplete", { messageId, code });
      },
      onMessageBlocked({ info }) {
        nexconnEvents.emit("messageBlocked", info);
      },
    }),
  );

  NCEngine.addTranslateHandler(
    "margin",
    new chat.TranslateHandler({
      onTranslationCompleted({ results }) {
        nexconnEvents.emit("translation", results);
      },
    }),
  );
}

type Engine = { chat: ChatModule; chatui: NCChatUIApplication | null };

export type NexconnSession = Engine & { userId: string };

async function initEngine(token: TokenResponse, withChatUI: boolean): Promise<Engine> {
  if (store.engine) return store.engine;

  const chat = await import("@nexconn/chat");
  chat.NCEngine.initialize({
    appKey: token.appKey,
    areaCode: chat.AreaCode[token.area],
    logLevel: chat.LogLevel.WARN,
  });

  let chatui: NCChatUIApplication | null = null;
  if (withChatUI) {
    const { NCChatUIApplication } = await import("@nexconn/chatui");
    chatui = NCChatUIApplication.initialize({ hooks: devHooks, language: "en_US" });
    if (!chatui) throw new Error("ChatUI could not initialize in this browser");
    const registered = chatui.registerCustomMessages(chatUIRegistrations());
    nexconnEvents.emit("chatuiRegister", { code: registered.code });
    chatui.setChannelBarSwitch(false);
    chatui.ready();
  } else {
    chat.NCEngine.registerCustomMessages(MG_REGISTRATIONS);
  }

  addHandlers(chat);
  store.engine = { chat, chatui };
  return store.engine;
}

async function connect(options: {
  userId: string;
  name: string;
  withChatUI: boolean;
}): Promise<NexconnSession> {
  const token = await fetchToken(options.userId, options.name, false);
  const { chat, chatui } = await initEngine(token, options.withChatUI);

  let result = await chat.NCEngine.connect({ token: token.accessToken });
  if (result.code === ClientCode.TokenInvalid) {
    nexconnEvents.emit("tokenRefresh", { reason: result.code });
    const fresh = await fetchToken(options.userId, options.name, true);
    result = await chat.NCEngine.connect({ token: fresh.accessToken });
  }
  if (!result.isOk) {
    throw new NexconnConnectError(result.code, result.msg ?? "Nexconn connect failed");
  }

  const userId = result.data?.userId ?? options.userId;
  nexconnEvents.emit("connected", { userId });
  return { chat, chatui, userId };
}

export function startNexconn(options: {
  userId: string;
  name: string;
  withChatUI: boolean;
}): Promise<NexconnSession> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Nexconn can only start in the browser"));
  }
  store.session ??= connect(options).catch((error: unknown) => {
    store.session = null;
    throw error;
  });
  return store.session;
}
