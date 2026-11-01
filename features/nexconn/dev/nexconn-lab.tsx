"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getReceivedMessage,
  nexconnEvents,
  startNexconn,
  type NexconnEvent,
  type NexconnSession,
} from "@/features/nexconn/client/engine";
import { SEEK_EVENT, type SeekEventDetail } from "@/features/nexconn/client/moment-element";
import { ClientCode } from "@/features/nexconn/shared/codes";
import { DEV_LECTURE_CHANNEL_ID } from "@/features/nexconn/shared/config";
import {
  decodeContent,
  MG,
  momentSchema,
  type MomentPayload,
} from "@/features/nexconn/shared/messages";

const DEV_USERS = ["devalice", "devbob"] as const;
const HINDI_SAMPLE = "नमस्ते, यह कक्षा का एक प्रश्न है";
const LOG_LIMIT = 200;
const STATUS_LABELS: Record<number, string> = {
  0: "CONNECTED",
  1: "CONNECTING",
  2: "DISCONNECTED",
  3: "SUSPENDED",
};

type MessageEventData = {
  messageId: string;
  messageType: string;
  content: unknown;
};

type ServerMoment = { messageId: string; momentId: string };

async function devAction(body: Record<string, unknown>) {
  const response = await fetch("/api/dev/nexconn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(data)}`);
  return data as Record<string, unknown>;
}

function textOf(content: unknown): string | null {
  if (content && typeof content === "object" && "text" in content) {
    const text = (content as { text: unknown }).text;
    return typeof text === "string" ? text : null;
  }
  return null;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function NexconnLab() {
  const [userId, setUserId] = useState<string>(DEV_USERS[0]);
  const [session, setSession] = useState<NexconnSession | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const [events, setEvents] = useState<NexconnEvent[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [momentText, setMomentText] = useState("What is a closure?");
  const [momentTime, setMomentTime] = useState("125");
  const [serverMoment, setServerMoment] = useState<ServerMoment | null>(null);
  const [upvotes, setUpvotes] = useState(0);
  const [streams, setStreams] = useState<Record<string, string>>({});
  const [lastText, setLastText] = useState<{ messageId: string; text: string } | null>(null);
  const [lastMoment, setLastMoment] = useState<{ messageId: string; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const chatContainer = useRef<HTMLDivElement>(null);
  const streamedIds = useRef(new Set<string>());

  const log = useCallback((kind: string, data: unknown) => nexconnEvents.emit(kind, data), []);

  useEffect(() => {
    return nexconnEvents.subscribe((event) => {
      setEvents((previous) => [event, ...previous].slice(0, LOG_LIMIT));

      if (event.kind === "connection") {
        setStatus((event.data as { status: number }).status);
      }
      if (event.kind === "streamDelta" || event.kind === "streamInit") {
        const { messageId, text } = event.data as { messageId: string; text?: string };
        streamedIds.current.add(messageId);
        if (text !== undefined) setStreams((previous) => ({ ...previous, [messageId]: text }));
      }
      if (event.kind === "message") {
        const message = event.data as MessageEventData;
        if (message.messageType === "RC:TxtMsg") {
          const text = textOf(message.content);
          if (text) setLastText({ messageId: message.messageId, text });
        }
        if (message.messageType === MG.Moment) {
          const moment = decodeContent(momentSchema, message.content);
          if (moment) setLastMoment({ messageId: message.messageId, text: moment.text });
        }
        if (message.messageType === "RC:StreamMsg") {
          const { messageId } = message;
          window.setTimeout(() => {
            if (streamedIds.current.has(messageId)) return;
            const received = getReceivedMessage(messageId);
            if (!received) return;
            nexconnEvents.emit("streamRequested", { messageId, reason: "no delta within 2s" });
            void received.requestStreamMessage().then((result) => {
              nexconnEvents.emit("streamRequestResult", { messageId, code: result.code });
            });
          }, 2000);
        }
      }
    });
  }, []);

  useEffect(() => {
    const container = chatContainer.current;
    const chatui = session?.chatui;
    if (!container || !chatui) return;

    const root = document.createElement("nc-chat-ui-app-provider");
    root.style.width = "100%";
    root.style.height = "100%";
    container.appendChild(root);

    const onSeek = (event: Event) => {
      nexconnEvents.emit("seek", (event as CustomEvent<SeekEventDetail>).detail);
    };
    container.addEventListener(SEEK_EVENT, onSeek);

    let cancelled = false;
    void (async () => {
      const channel = new session.chat.GroupChannelIdentifier(DEV_LECTURE_CHANNEL_ID);
      for (let attempt = 1; attempt <= 5 && !cancelled; attempt++) {
        const result = await chatui.openChannel(channel, false);
        nexconnEvents.emit("chatuiOpenChannel", { attempt, code: result.code });
        if (result.code !== ClientCode.ChatUIChannelNotReady) return;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    })();

    return () => {
      cancelled = true;
      container.removeEventListener(SEEK_EVENT, onSeek);
      root.remove();
    };
  }, [session]);

  async function run(label: string, task: () => Promise<unknown>) {
    setBusy(label);
    try {
      const result = await task();
      log(`${label}:ok`, result);
    } catch (error) {
      log(`${label}:error`, error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function connect() {
    setConnecting(true);
    try {
      setSession(await startNexconn({ userId, name: userId, withChatUI: true }));
    } catch (error) {
      log(
        "connect:error",
        error instanceof Error ? { name: error.name, message: error.message } : error,
      );
    } finally {
      setConnecting(false);
    }
  }

  function sendClientMoment() {
    if (!session) return;
    void run("clientMoment", async () => {
      const { chat } = session;
      const payload: MomentPayload = {
        momentId: crypto.randomUUID().replaceAll("-", ""),
        lectureId: DEV_LECTURE_CHANNEL_ID,
        tSec: Number(momentTime) || 0,
        text: momentText,
        parentId: null,
      };
      const result = await new chat.GroupChannel(DEV_LECTURE_CHANNEL_ID).sendMessage(
        new chat.SendMessageParams<MomentPayload>(payload, MG.Moment),
      );
      return { isOk: result.isOk, code: result.code, messageId: result.data?.messageId };
    });
  }

  function sendServerMoment() {
    void run("serverMoment", async () => {
      const result = await devAction({
        action: "moment",
        fromUserId: userId,
        text: momentText,
        tSec: Number(momentTime) || 0,
      });
      if (typeof result.messageId === "string" && typeof result.momentId === "string") {
        setServerMoment({ messageId: result.messageId, momentId: result.momentId });
        setUpvotes(0);
      }
      return result;
    });
  }

  function upvoteFromServer() {
    if (!serverMoment) return;
    const next = upvotes + 1;
    setUpvotes(next);
    void run("serverMetadata", () =>
      devAction({ action: "metadata", messageId: serverMoment.messageId, upvotes: next }),
    );
  }

  function upvoteFromBrowser() {
    const target = serverMoment ?? lastMoment;
    if (!target) return;
    void run("browserMetadata", async () => {
      const message = getReceivedMessage(target.messageId);
      if (!message) return { skipped: "message not received in this browser" };
      const result = await message.setMetadata({ upvotes: String(upvotes + 1) });
      return { code: result.code, isOk: result.isOk };
    });
  }

  function sendMomentUpdate() {
    if (!serverMoment) return;
    void run("momentUpdate", () =>
      devAction({ action: "momentUpdate", momentId: serverMoment.momentId, upvotes }),
    );
  }

  function sendHindiText() {
    if (!session) return;
    void run("hindiText", async () => {
      const { chat } = session;
      const result = await new chat.GroupChannel(DEV_LECTURE_CHANNEL_ID).sendMessage(
        new chat.SendTextMessageParams({ text: HINDI_SAMPLE }),
      );
      return { isOk: result.isOk, code: result.code, messageId: result.data?.messageId };
    });
  }

  function translateMessage(target: { messageId: string; text: string } | null, label: string) {
    if (!session || !target) return;
    void run(label, async () => {
      const { chat } = session;
      const result = await chat.NCEngine.translateModule.translateMessages({
        list: [new chat.TranslateMessageParam(target.messageId, "auto", "en", target.text)],
        force: false,
      });
      return { accepted: result.isOk, code: result.code };
    });
  }

  function translateText() {
    if (!session) return;
    void run("translateText", async () => {
      const { chat } = session;
      const result = await chat.NCEngine.translateModule.translateTexts({
        list: [new chat.TranslateTextParam(lastText?.text ?? HINDI_SAMPLE, "auto", "en")],
      });
      return { accepted: result.isOk, code: result.code };
    });
  }

  async function copyLog() {
    const lines = [...events]
      .reverse()
      .map(
        (event) =>
          `${new Date(event.at).toISOString()} ${event.kind} ${JSON.stringify(event.data)}`,
      );
    try {
      await navigator.clipboard.writeText(`user=${userId}\n${lines.join("\n")}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      log("copy:error", "Clipboard not available");
    }
  }

  const connected = status === 0;
  const disabled = !session || busy !== null;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Nexconn lab</h1>
        <p className="text-sm text-muted-foreground">
          Day 2 checks. Open this page in two separate browser profiles as devalice and devbob.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Section title="G0 · Identity and connection">
            <div className="flex flex-wrap gap-2">
              {DEV_USERS.map((id) => (
                <Button
                  key={id}
                  variant={userId === id ? "default" : "outline"}
                  size="sm"
                  disabled={session !== null}
                  onClick={() => setUserId(id)}
                >
                  {id}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={connect} disabled={session !== null || connecting}>
                {connecting ? "Connecting…" : "Connect"}
              </Button>
              <Button
                variant="outline"
                disabled={busy !== null}
                onClick={() =>
                  run("setup", () => devAction({ action: "setup", userIds: [...DEV_USERS] }))
                }
              >
                Setup dev group
              </Button>
            </div>
            <p className="text-sm" aria-live="polite">
              Status:{" "}
              <span className={connected ? "font-medium text-green-600" : "font-medium"}>
                {status === null
                  ? "not connected"
                  : `${STATUS_LABELS[status] ?? "UNKNOWN"} (${status})`}
              </span>
              {session ? ` · ${session.userId}` : null}
            </p>
          </Section>

          <Section title="G1 / G2 · MG:Moment">
            <div className="grid grid-cols-[1fr_5rem] gap-2">
              <label className="sr-only" htmlFor="moment-text">
                Moment text
              </label>
              <Input
                id="moment-text"
                value={momentText}
                onChange={(e) => setMomentText(e.target.value)}
              />
              <label className="sr-only" htmlFor="moment-time">
                Seconds into the lecture
              </label>
              <Input
                id="moment-time"
                inputMode="numeric"
                value={momentTime}
                onChange={(e) => setMomentTime(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={disabled} onClick={sendClientMoment}>
                Client moment
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={sendServerMoment}
              >
                Server moment
              </Button>
            </div>
          </Section>

          <Section title="G3 · Metadata">
            <p className="text-sm text-muted-foreground">
              {serverMoment
                ? `Last server moment ${serverMoment.messageId} · upvotes ${upvotes}`
                : "Send a server moment first."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!serverMoment || busy !== null}
                onClick={upvoteFromServer}
              >
                Upvote (server)
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={disabled || (!serverMoment && !lastMoment)}
                onClick={upvoteFromBrowser}
              >
                Upvote (browser setMetadata)
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!serverMoment || busy !== null}
                onClick={sendMomentUpdate}
              >
                Send MG:MomentUpdate
              </Button>
            </div>
          </Section>

          <Section title="G4 · Streaming">
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => run("stream", () => devAction({ action: "stream" }))}
            >
              Stream fixed answer
            </Button>
            {Object.entries(streams).map(([messageId, text]) => (
              <p key={messageId} className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">
                {text}
              </p>
            ))}
          </Section>

          <Section title="G5 · Translation (uses translation quota)">
            <p className="text-sm text-muted-foreground">
              Last text: {lastText ? lastText.text : "none received yet"}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={disabled} onClick={sendHindiText}>
                Send Hindi text
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={disabled || !lastText}
                onClick={() => translateMessage(lastText, "translateMessage")}
              >
                Translate message → en
              </Button>
              <Button size="sm" variant="outline" disabled={disabled} onClick={translateText}>
                translateTexts → en
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={disabled || !lastMoment}
                onClick={() => translateMessage(lastMoment, "translateMoment")}
              >
                Translate MG:Moment
              </Button>
            </div>
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="G6 · ChatUI">
            <div
              ref={chatContainer}
              className="h-[480px] overflow-hidden rounded-md border bg-background"
            >
              {!session ? (
                <p className="p-4 text-sm text-muted-foreground">Connect to mount ChatUI.</p>
              ) : null}
            </div>
          </Section>

          <Section title="Event log">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={copyLog} disabled={events.length === 0}>
                {copied ? "Copied" : "Copy log"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEvents([])}
                disabled={events.length === 0}
              >
                Clear
              </Button>
            </div>
            <ol className="max-h-96 space-y-1 overflow-auto font-mono text-xs">
              {events.length === 0 ? (
                <li className="text-muted-foreground">No events yet.</li>
              ) : null}
              {events.map((event) => (
                <li key={event.id} className="break-all">
                  <span className="text-muted-foreground">
                    {new Date(event.at).toLocaleTimeString()}
                  </span>{" "}
                  <span className="font-semibold">{event.kind}</span> {JSON.stringify(event.data)}
                </li>
              ))}
            </ol>
          </Section>
        </div>
      </div>
    </main>
  );
}
