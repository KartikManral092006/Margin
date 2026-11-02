import { describe, expect, it } from "vitest";
import {
  CHAT_KEEP,
  CHAT_MAX_CHARS,
  chatLineFromMessage,
  mergeChat,
  normalizeChatText,
  type ChatLine,
} from "@/features/chat/shared/chat";

const line = (id: string, sentTime: number, overrides: Partial<ChatLine> = {}): ChatLine => ({
  id,
  senderId: "u",
  text: id,
  sentTime,
  mine: false,
  local: null,
  ...overrides,
});

describe("normalizeChatText", () => {
  it("trims, drops control characters and caps the length", () => {
    expect(normalizeChatText("  hi\u0000 there \n\n\n\n ok ")).toBe("hi  there \n\n ok");
    expect(Array.from(normalizeChatText("😀".repeat(CHAT_MAX_CHARS + 10)))).toHaveLength(
      CHAT_MAX_CHARS,
    );
  });
});

describe("mergeChat", () => {
  it("orders by time and de-duplicates by id", () => {
    const merged = mergeChat(
      [line("b", 2), line("a", 1)],
      [line("b", 2, { text: "B2" }), line("c", 3)],
    );
    expect(merged.map((l) => [l.id, l.text])).toEqual([
      ["a", "a"],
      ["b", "B2"],
      ["c", "c"],
    ]);
  });

  it("keeps only the newest messages", () => {
    const many = Array.from({ length: CHAT_KEEP + 5 }, (_, i) => line(`m${i}`, i));
    const merged = mergeChat([], many);
    expect(merged).toHaveLength(CHAT_KEEP);
    expect(merged[0]?.id).toBe("m5");
  });
});

describe("chatLineFromMessage", () => {
  const message = {
    messageId: "nx1",
    messageType: "RC:TxtMsg",
    senderUserId: "U1",
    sentTime: 1000,
    content: { text: "  hello  " },
  };

  it("turns a text message into a chat line", () => {
    expect(chatLineFromMessage(message, "me")).toEqual({
      id: "nx1",
      senderId: "U1",
      text: "hello",
      sentTime: 1000,
      mine: false,
      local: null,
    });
    expect(chatLineFromMessage(message, "U1")?.mine).toBe(true);
  });

  it.each([
    ["a doubt (MG:Moment)", { messageType: "MG:Moment" }],
    ["an empty text", { content: { text: "   " } }],
    ["a missing sender", { senderUserId: undefined }],
    ["a non-text content", { content: { text: 42 } }],
  ])("ignores %s", (_label, overrides) => {
    expect(chatLineFromMessage({ ...message, ...overrides }, "me")).toBeNull();
  });
});
