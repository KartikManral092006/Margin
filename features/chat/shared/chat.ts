export const CHAT_MAX_CHARS = 500;
export const CHAT_KEEP = 200;
export const TEXT_MESSAGE_TYPE = "RC:TxtMsg";

export type ChatLine = {
  // Nexconn message id, or a temporary id while sending.
  id: string;
  senderId: string;
  text: string;
  sentTime: number;
  mine: boolean;
  local: "sending" | "failed" | null;
};

export function normalizeChatText(raw: string): string {
  const text = raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return Array.from(text).slice(0, CHAT_MAX_CHARS).join("");
}

// Merges incoming lines by id, oldest first, keeping the newest CHAT_KEEP.
export function mergeChat(current: ChatLine[], incoming: ChatLine[]): ChatLine[] {
  const byId = new Map(current.map((line) => [line.id, line]));
  for (const line of incoming) byId.set(line.id, line);
  return [...byId.values()]
    .sort((a, b) => a.sentTime - b.sentTime || a.id.localeCompare(b.id))
    .slice(-CHAT_KEEP);
}

type RawMessage = {
  messageId?: string;
  messageType?: string;
  senderUserId?: string;
  sentTime?: number;
  content?: unknown;
};

// A text message from Nexconn as a chat line, or null for anything else.
export function chatLineFromMessage(message: RawMessage, selfId: string | null): ChatLine | null {
  if (message.messageType !== TEXT_MESSAGE_TYPE || !message.messageId || !message.senderUserId) {
    return null;
  }
  const content = message.content as { text?: unknown; content?: unknown } | null | undefined;
  const raw = typeof content?.text === "string" ? content.text : content?.content;
  if (typeof raw !== "string") return null;
  const text = normalizeChatText(raw);
  if (!text) return null;
  return {
    id: message.messageId,
    senderId: message.senderUserId,
    text,
    sentTime: message.sentTime ?? Date.now(),
    mine: message.senderUserId === selfId,
    local: null,
  };
}
