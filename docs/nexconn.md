# Nexconn integration reference (Margin)

Status: written 2026-11-01 from docs.nexconn.ai (plain Markdown pages, index at `/llms.txt`), plus `npm view` and the shipped `@nexconn/chat@26.2.1` `index.d.ts`. Every fact names its source page. Where the docs disagree with themselves or with the shipped types, this file says so. Anything not documented is in section 10 ("Must test on Day 2").

Rules for using this file:

- When a guide page and the shipped `.d.ts` disagree, trust the `.d.ts`.
- Check each API with a real call on Day 2 before building features on top of it.

---

## 1. Packages

| Package           | Version to pin | Browser-only? | Notes                                                                                                                                                                                                                                                                                            | Source                                          |
| ----------------- | -------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `@nexconn/engine` | `26.2.1` exact | Yes           | Core engine. "Keep it on the same version as `@nexconn/chat`".                                                                                                                                                                                                                                   | `/chatsdk-web/import.md`                        |
| `@nexconn/chat`   | `26.2.1` exact | Yes           | Exports `NCEngine`, `AreaCode`, `GroupChannel`, `OpenChannel`, `BaseChannel`, `SendMessageParams`, `MessageHandler`, `TranslateHandler`, `UserHandler`, and more. Peer dependency `@nexconn/engine: "=26.2.1"` (exact pin). Do not use the `alpha` tag (26.5.0-alpha.9).                         | `/chatsdk-web/import.md`; npm view              |
| `@nexconn/chatui` | `26.2.5` exact | Yes           | Lit-based Web Components, Apache-2.0, source at github.com/NexconnAI-Dev/nexconn-chatui-web. Peers: `lit ^3.3.2`, `@nexconn/chat ^26.2.1`, `@nexconn/engine ^26.2.1`.                                                                                                                            | `/chatui-web/quickstart.md`; npm view           |
| `lit`             | `^3.3.2`       | Yes           | npm lists it as a **peer** of chatui. The quickstart says chatui "already declares lit in its package dependencies", which conflicts with npm. Add it explicitly.                                                                                                                                | npm view; `/chatui-web/quickstart.md`           |
| `@nexconn/call`   | defer          | Yes           | `26.2.1` declares peers `@nexconn/chat: 26.2.0` and `@nexconn/engine: 26.2.0`. That conflicts with chat@26.2.1's `engine =26.2.1`. Do not install it on Day 2.                                                                                                                                   | `/callsdk-web.md`; npm view                     |
| Node server SDK   | **none**       | n/a           | `/platform-chat-api/prepare-to-use-api/auth.md` lists only Java, PHP and Go SDKs (all under github.com/rongcloud). npm has no `@nexconn` server package. The npm package `rongcloud-sdk` is not mentioned in the Nexconn docs; **do not use it**. Margin calls the REST API with its own signer. | `/platform-chat-api/prepare-to-use-api/auth.md` |

The SDK pages say nothing about SSR, Node, or Next.js (`/chatsdk-web/import.md`). From ChatUI source, not the docs: `NCChatUIApplication.initialize` returns `null` unless `runtime.tag === 'browser' && typeof customElements !== 'undefined'`. Treat every `@nexconn/*` package as browser-only and load it with a dynamic `import()` inside an effect.

Supported browsers:

- Chat SDK: Chrome, Firefox, Safari, IE 10+, Edge (`/chatsdk-web/import.md`).
- ChatUI: Chrome 68+, Safari 13+, Edge 100+. The WeChat browser is not supported, and "Portrait mobile browsers are not a supported target" (`/chatui-web/quickstart.md`).

## 2. Credentials and where each lives

| Credential   | Secret?                                                                     | Lives in                                                                      | Why                                                                                                                                                       | Source                                                                        |
| ------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| App Key      | Not a secret. The docs do not call it public, but the browser must have it. | Server env `NEXCONN_APP_KEY`; returned to the browser by `/api/nexconn/token` | `NCEngine.initialize({ appKey, ... })` runs in the browser. The App Key is also sent in every REST header.                                                | `/chatsdk-web/init.md`; `/platform-chat-api/prepare-to-use-api/auth.md`       |
| App Secret   | **Yes**                                                                     | Server env `NEXCONN_APP_SECRET` only, read from a `server-only` module        | "Never transmit it over the network or store it in untrusted locations (such as a browser)."                                                              | `/platform-chat-api/prepare-to-use-api/auth.md`                               |
| Access token | Per user                                                                    | Issued by our server, held in browser memory, cached server-side (Redis)      | "Client SDKs do not provide an API for obtaining access tokens." "Store the access token securely on the client side. Avoid exposing it in logs or URLs." | `/platform-chat-api/user/register.md`; `/chatsdk-web/connection/connect.md`   |
| Data center  | No                                                                          | Server env `NEXCONN_AREA` (SG/NA/SA), returned to the browser                 | App Key data center, REST host and client `areaCode` must all match. Data cannot move between data centers. Singapore is the default.                     | `/guides/data-center.md`; `/platform-chat-api/prepare-to-use-api/base-url.md` |

More facts about credentials:

- **Correction (Nov 2):** `/chatsdk-web.md` says "Each app has one App Key. Use the same App Key throughout development, testing, and release." The earlier dev/prod split came from `/callsdk-web.md` and does not apply here. Get the App Key, App Secret and data center from Console > Key Management (`https://console.nexconn.ai/agile/apps/km`).
- Refreshing the App Secret in the Console **invalidates every issued token** (`/platform-chat-api/user/register.md`). Do not rotate it mid-hackathon.

## 3. Server REST API

### 3.1 Transport

- Every endpoint is `POST` over HTTPS (`/platform-chat-api.md`).
- Content type: the getting-started page contradicts itself ("Most endpoints accept `application/x-www-form-urlencoded`" and also "Most newly published ... use `application/json`"). Every reference page read uses `Content-Type: application/json`. Follow each endpoint's own page (`/platform-chat-api.md`).
- Base URLs (`/platform-chat-api/prepare-to-use-api/base-url.md`):

| Area                | Primary                         | Backup                            | Client `AreaCode` (d.ts)                                                                                                                   |
| ------------------- | ------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Singapore (default) | `https://api.sg-light-api.com`  | `https://api-b.sg-light-api.com`  | `AreaCode.SG` (2)                                                                                                                          |
| North America       | `https://api.us-light-api.com`  | `https://api-b.us-light-api.com`  | `AreaCode.NA` (3)                                                                                                                          |
| Saudi Arabia        | `https://api.sau-light-api.com` | `https://api-b.sau-light-api.com` | `AreaCode.SA` (5)? The d.ts comment says "enum identifier `SOUTH_AMERICA`; confirm with your deployment docs". The mapping is unconfirmed. |

The InitParams JSDoc example uses `AreaCode.SINGAPORE`, which the type does not have. Use `AreaCode.SG` (`/chatsdk-web/init.md`; d.ts).

- Failover: on a response timeout (recommended 5 s) or an unexpected HTTP status, switch to the backup domain right away and update the stored domain record (`base-url.md`).
- "Avoid using persistent HTTP connections (KeepAlive)". If you must use them, keep idle time under 55 s and reuse each connection for fewer than 80 requests (`base-url.md`). Node's `fetch` (undici) keeps connections alive by default. This is an accepted hackathon risk unless we set up a custom undici `Agent`.
- No idempotency key is documented for sends. A blind retry after a timeout can deliver a duplicate message.

### 3.2 Signing (`/platform-chat-api/prepare-to-use-api/auth.md`)

Headers on every request:

| Header         | Value                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `App-Key`      | App Key                                                                                                                                                                                           |
| `Nonce`        | random string, **at most 18 characters**, new per request ("Use a different value for each request" is on `/platform-chat-api.md`)                                                                |
| `Timestamp`    | `String(Date.now())`, Unix **milliseconds**                                                                                                                                                       |
| `Signature`    | `sha1(appSecret + nonce + timestamp)` as hex                                                                                                                                                      |
| `X-Request-ID` | optional, recommended; at most 36 characters, new per request. The Java example uses a UUID with dashes removed. If you omit it, the server generates one and returns it in the response headers. |
| `Content-Type` | `application/json`                                                                                                                                                                                |

TypeScript-ready description:

```ts
import { createHash, randomBytes, randomUUID } from "node:crypto";
const nonce = randomBytes(8).toString("hex"); // 16 chars ≤ 18
const timestamp = String(Date.now()); // ms
const signature = createHash("sha1")
  .update(appSecret + nonce + timestamp)
  .digest("hex"); // lowercase hex
const requestId = randomUUID().replaceAll("-", ""); // 32 chars ≤ 36
```

- The request body is **not** part of the signature (the formula has only these three inputs).
- Hex case: the Go reference uses `fmt.Sprintf("%x")`, which is lowercase. The webhook page says outright "lowercase hexadecimal". Use lowercase.
- **Do not port the Go nonce** `strconv.Itoa(rand.Int())`. On 64-bit platforms it can be 19 digits, which breaks the 18-character limit.
- Failures: HTTP 401. Business codes `1004` = signature verification failed and `1001` = incorrect App Secret (`/platform-chat-api/code.md`).
- **No usable test vector in the docs.** The HTTP example on auth.md shows `Nonce: 14314`, `Timestamp: 1408710653000`, `Signature: 30be0bbca9c9b2e27578701e9fda2358a814c88f`, but it never gives the App Secret used. With the PHP placeholder secret `your-own-app-secret` the result is `7226f13eb94356169e9778e27d5539df875cbec3`, not the documented value. That vector was computed locally with `shasum`; it is not from the docs.
- No timestamp tolerance or nonce replay window is documented.

### 3.3 Response and errors (`/platform-chat-api/code.md`)

- Success is HTTP 200 with JSON `{ code: 0, result?: {...} }`. Errors carry `errorMessage`.
- HTTP statuses: 400, 401 (auth), 403, 404, 405, 429 (rate), 430 (service not enabled), 500, 504 (retry).
- Business codes Margin will meet:

| Code                                    | Meaning                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `1000`/`1002`                           | invalid params                                                                                                |
| `1005`                                  | param too long                                                                                                |
| `1006`                                  | app offline (check the domain)                                                                                |
| `1007`                                  | IP restriction                                                                                                |
| `1008`                                  | rate limit                                                                                                    |
| `1009`                                  | service not enabled                                                                                           |
| `1050`                                  | internal timeout; retry                                                                                       |
| `400` (business code, not HTTP)         | "The user ID does not exist"; register the user first                                                         |
| `2007`                                  | registered-user limit (see section 9)                                                                         |
| `25409`                                 | group ID already exists                                                                                       |
| `25410`                                 | group missing                                                                                                 |
| `25411`                                 | group full                                                                                                    |
| `25412`                                 | already a member                                                                                              |
| `25414`                                 | joining not allowed                                                                                           |
| `25417`                                 | owner cannot leave or be kicked                                                                               |
| `23410`                                 | open channel does not exist                                                                                   |
| `23435`                                 | open channel already exists                                                                                   |
| `23423`/`23424`/`23426`/`23427`/`23434` | open-channel metadata errors: >100 entries / no permission / service not enabled / entry missing / no user ID |
| `23432`                                 | ttlMinutes out of the 60–10080 range                                                                          |
| `28400`                                 | translation not enabled                                                                                       |
| `28405`                                 | translation quota exceeded                                                                                    |
| `29001`–`29007`                         | streaming errors: `29004` 30-minute cap, `29005` deleted by moderation, `29006` 128 KB cap                    |

- Treat success as HTTP 200 **and** `code === 0`. Treat `25409`, `25412` and `23435` as "already done".

### 3.4 Endpoints Margin uses

| Purpose                                  | Endpoint                                                                                                                                                                                                                                           | Body (required in **bold**)                                                                                                                                                                                                                                                                         | Response                                                                                          | Rate                                                                | Source                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Register user / issue token              | `/v4/auth/access-token/issue`                                                                                                                                                                                                                      | **`userId`** (letters and digits only, ≤64 bytes), **`name`** (≤64 chars, used only for push), `avatarUrl` (≤1024 bytes)                                                                                                                                                                            | `{code:0,result:{userId,accessToken}}`, accessToken ≤256 bytes                                    | 200/s                                                               | `/platform-chat-api/user/register.md`                                                            |
| Expire tokens                            | `/v4/auth/access-token/expire`                                                                                                                                                                                                                     | **`userIds`** (≤20; the table says String, the example sends an array, so use an array), **`expiresAt`** (ms)                                                                                                                                                                                       | `{code:0}`                                                                                        | 100/s                                                               | `/platform-chat-api/user/expire.md`                                                              |
| Ban user (app-wide)                      | `/v4/user/ban`                                                                                                                                                                                                                                     | **`userIds`** String[] ≤20, **`durationMinutes`** ≤43200                                                                                                                                                                                                                                            | `{code:0}`                                                                                        | 100/s                                                               | `/platform-chat-api/user/block.md`                                                               |
| Unban                                    | `/v4/user/unban`                                                                                                                                                                                                                                   | **`userIds`** ≤20                                                                                                                                                                                                                                                                                   |                                                                                                   | 100/s                                                               | `/platform-chat-api/user/unblock.md`                                                             |
| List bans                                | `/v4/user/ban/list`                                                                                                                                                                                                                                | `page`, `pageSize` (default 50)                                                                                                                                                                                                                                                                     | `result.bannedUsers[{userId,banExpiresAt}]`                                                       |                                                                     | `/platform-chat-api/user/query-blocked-list.md`                                                  |
| Online check                             | `/v4/user/connection-status/get`                                                                                                                                                                                                                   | **`userId`**                                                                                                                                                                                                                                                                                        | `result.status` "1" = online, "0" = not online                                                    | 100/s, "should not be called frequently"                            | `/platform-chat-api/user/check-online-status-by-user.md`                                         |
| Create group                             | `/v4/group-channel/create`                                                                                                                                                                                                                         | **`channelId`** (≤64, "uppercase and lowercase letters and numbers"), **`name`** (≤64), **`owner`** (auto-joins), `userIds` (≤30), `groupProfile`, `permissions`, `groupExtProfile`                                                                                                                 | `{code:0}`                                                                                        | 100/s                                                               | `/platform-chat-api/group-channel/managing-channels/create-group.md`                             |
| Join group (server)                      | `/v4/group-channel/join`                                                                                                                                                                                                                           | **`channelId`**, **`userIds`** (≤100)                                                                                                                                                                                                                                                               | `result{channelId,name,...,memberCount}`; no approval needed                                      | 100/s                                                               | `/platform-chat-api/group-channel/managing-members/join-group.md`                                |
| Remove from group                        | `/v4/group-channel/leave`                                                                                                                                                                                                                          | **`channelId`**, **`userIds`** (≤100), `shouldDeleteMute`/`shouldDeleteAllowedSendersList`/`shouldDeleteFavorites` (default 1)                                                                                                                                                                      |                                                                                                   |                                                                     | `/platform-chat-api/group-channel/managing-members/quit-group.md`                                |
| Dismiss group                            | `/v4/group-channel/dismiss`                                                                                                                                                                                                                        | **`channelId`**                                                                                                                                                                                                                                                                                     |                                                                                                   |                                                                     | `/platform-chat-api/group-channel/managing-members/dismiss-group.md`                             |
| Update group                             | `/v4/group-channel/profile/update`                                                                                                                                                                                                                 | `channelId`, `groupProfile` (incl. `name`), `permissions`, `groupExtProfile`                                                                                                                                                                                                                        |                                                                                                   |                                                                     | `/platform-chat-api/group-channel/managing-channels/update-group-info.md`                        |
| Mute in group                            | `/v4/group-channel/user/mute-list/add`                                                                                                                                                                                                             | **`userIds`** ≤20, `channelId` (empty = all groups), **`durationMinutes`** ≤43200 (0 = permanent)                                                                                                                                                                                                   |                                                                                                   |                                                                     | `/platform-chat-api/group-channel/mute/gag-user.md`                                              |
| **Send group message**                   | `/v4/group-channel/message/send`                                                                                                                                                                                                                   | **`fromUserId`**, **`toChannelIds`** (≤3; the table says String, the examples use an array), **`messageType`**, **`content`** (String), plus the optional fields listed below                                                                                                                       | `result.messageIds[{channelId,messageId}]`                                                        | **20/s**, counted per target group                                  | `/platform-chat-api/message/send-group.md`                                                       |
| **Send group stream**                    | `/v4/group-channel/message/stream/send`                                                                                                                                                                                                            | **`fromUserId`**, **`toChannelId`** (single), **`messageType:"RC:StreamMsg"`**, **`content`** (Object, see below), `toUserIds` (≤10, repeat in every chunk), `isEchoToSender` (**default 1**), `shouldPersist` (default 1), `hasMention`, `metadata`, `disableUpdateLastMsg`                        | `result.messageId` on the **first chunk only**                                                    | not documented                                                      | `/platform-chat-api/message/send-group-stream.md`                                                |
| **Set message metadata**                 | `/v4/channel-type/message/metadata/set`                                                                                                                                                                                                            | **`messageId`**, **`userId`** (operator), **`channelType`** (1 direct, 3 group), **`channelId`**, **`metadata`** `{k:v}`, `isEchoToSender` (default 0)                                                                                                                                              | `{code:0}`                                                                                        | 100/s total, **20/s for group, and it shares the group-send quota** | `/platform-chat-api/message/set-expansion.md`; `/platform-chat-api/prepare-to-use-api/limits.md` |
| Get message metadata                     | `/v4/channel-type/message/metadata/list`                                                                                                                                                                                                           | **`messageId`**, `page`                                                                                                                                                                                                                                                                             | `result.metadata{key:{value,updatedAt}}`, up to 300 per page                                      |                                                                     | `/platform-chat-api/message/get-expansion.md`                                                    |
| Delete message metadata                  | `/v4/channel-type/message/metadata/delete`                                                                                                                                                                                                         | `messageId`, `userId`, `channelType`, `channelId`, **`keys`** (≤100), **`syncToSender`** (not `isEchoToSender`)                                                                                                                                                                                     |                                                                                                   | shares the group-send quota                                         | `/platform-chat-api/message/delete-expansion.md`                                                 |
| Create open channel                      | `/v4/open-channel/create`                                                                                                                                                                                                                          | **`channelId`** (no format rule documented), `destroyType` (0 on inactivity, default; 1 on schedule), `ttlMinutes` (60–10080, default 60), `shouldFreeze`, `allowedSendersList` (≤20), `metadataOwnerId`+`metadata` (needs the metadata service; ≤20)                                               | `{code:0}`. The page example is `{"channelId":"gid1","destroyType":1,"ttlMinutes":120}`           | 100/s                                                               | `/platform-chat-api/open-channel/create.md`                                                      |
| Get open channel                         | `/v4/open-channel/get`                                                                                                                                                                                                                             | **`channelId`**                                                                                                                                                                                                                                                                                     | `result{channelId,createdAt,participantCount,destroyType,ttlMinutes,isFrozen}`; `23410` = missing |                                                                     | `/platform-chat-api/open-channel/get.md`                                                         |
| Destroy open channel                     | `/v4/open-channel/destroy`                                                                                                                                                                                                                         | **`channelIds`** []                                                                                                                                                                                                                                                                                 | clients get `onChannelDestroyed`; metadata is deleted                                             |                                                                     | `/platform-chat-api/open-channel/destroy.md`                                                     |
| Open-channel send (server)               | `/v4/open-channel/message/send`                                                                                                                                                                                                                    | `fromUserId`, `toChannelIds` (≤10 recommended), `messageType`, `content`, `shouldPersist`, `isEchoToSender`, `priority` (0 standard, 1 allowlisted, 2 high, 3 low)                                                                                                                                  | `result.messageIds[]`                                                                             | 100/s                                                               | `/platform-chat-api/message/open-channel/send-open-channel.md`                                   |
| Open-channel metadata set / get / remove | `/v4/open-channel/metadata/batch/set` `{channelId, metadataOwnerId, metadata(≤20), shouldAutoDelete}` (force-overwrites); `/batch/get` `{channelId, metadataKeys?≤100}`; `/batch/remove` `{channelId, metadataOwnerId, metadataKeys}` (≤20, force) |                                                                                                                                                                                                                                                                                                     |                                                                                                   | 100 KV ops/s, counted per pair                                      | `/platform-chat-api/open-channel/kv-attribute/*.md`                                              |
| Priority message types (open channel)    | `/v4/open-channel/priority-message-type-list/add`                                                                                                                                                                                                  | `messageTypes`                                                                                                                                                                                                                                                                                      | applies to every open channel; max 20 per App Key                                                 |                                                                     | `/platform-chat-api/open-channel/whitelist/add-to-message-type-whitelist.md`                     |
| Priority senders                         | `/v4/open-channel/priority-sender-list/add`                                                                                                                                                                                                        | `channelId`, `participantIds` (≤20 per channel)                                                                                                                                                                                                                                                     | never dropped; not auto-removed when offline                                                      |                                                                     | `/platform-chat-api/open-channel/whitelist/add-to-user-whitelist.md`                             |
| Open-channel ban                         | `/v4/open-channel/participant/ban-list/add`                                                                                                                                                                                                        | `participantIds` ≤20, `channelId`, `durationMinutes` ≤43200, `extra`, `needNotify`                                                                                                                                                                                                                  | user is removed immediately                                                                       |                                                                     | `/platform-chat-api/open-channel/block/block-user.md`                                            |
| Participants                             | `/v4/open-channel/participant/list`                                                                                                                                                                                                                | `channelId`, `pageSize` ≤500, `order` 1/2                                                                                                                                                                                                                                                           | `result{total,participants[{participantId,createdAt}]}`; no page token                            |                                                                     | `/platform-chat-api/open-channel/member/query-member-list.md`                                    |
| **System message**                       | `/v4/system-channel/message/send`                                                                                                                                                                                                                  | **`fromUserId`** (must already have a token), **`toUserIds`** ≤100, **`messageType`** (custom: no `RC:` prefix, ≤32 chars), **`content`** (String, ≤10 KB), `pushContent` (needed for custom types that should push), `pushData`, `shouldPersist`, `disablePush`, `pushExt`, `disableUpdateLastMsg` | `result.messageIds[{userId,messageId}]`                                                           | 100 msgs/s, counted per recipient                                   | `/platform-chat-api/message/system/send-private.md`                                              |
| Profanity words                          | `/v4/profanity-word/batch/add` `{words:[{word≤32,replacement?≤32}]}` (no replacement = block). Related: `/batch/remove`, `/list`, `/remove`                                                                                                        |                                                                                                                                                                                                                                                                                                     | `result.remainingQuota`; changes take about 15 min                                                |                                                                     | `/platform-chat-api/moderation/batch-add-sensitive-word.md`                                      |

Optional fields on the **group send** (`/platform-chat-api/message/send-group.md`):

- `toUserIds` sends a targeted message (single group only). Targeted messages do **not** support `hasMetadata`, `metadata`, `disablePush` or `pushExt`, and they are not stored server-side unless Targeted Group cloud retention is enabled.
- `pushContent`, `pushData`.
- `isEchoToSender` (**default 0**: the message is not synced to the sender's client and not stored in the sender's history).
- `shouldPersist` (default 1).
- `hasMention`.
- `hasMetadata` (Boolean, default false, single group only). It is **required at send time** for metadata to be set later.
- `metadata`: keys ≤32 chars from `[A-Za-z0-9+=_-]`, values ≤4096, ≤100 pairs per request, ≤300 per message.
- `disablePush`, `pushExt`, `disableUpdateLastMsg`.
- `needReadReceipt` (persisted messages only).

Custom `messageType` rules: it "must not start with `RC:`, must not exceed 32 characters, and must be registered in the client SDK". Custom content "is flexible and not limited to JSON". Content must be ≤10 KB. An unregistered custom type falls back to `shouldPersist`, "but the client cannot parse the message". The sender does not have to be a group member. `fromUserId` "must have obtained an access token".

**Stream chunk `content` object** (`/platform-chat-api/message/send-group-stream.md`; `/platform-chat-api/message/message-about/objectname.md`):

- `content`: the chunk string.
- `seq`: starts at 1 and goes up strictly by 1. A gap or duplicate "may cause ordering issues".
- `complete`: Boolean.
- `completeReason?`.
- `type?`: `text`, `markdown` or `html`; first chunk only.
- `messageId?`: legacy name `messageUID`. Omit it on chunk 1 and include it on every later chunk. "If absent, the chunk is treated as the initial packet."
- `user?`, `mentionedInfo?`, `extra?`.
- The total across all chunks must be ≤128 KB. Streaming works in direct, group and system channels, not open channels (`/platform-chat-api/message/message-about/about-message-types.md`).

**Default behaviour of server-sent messages** (`/platform-chat-api/prepare-to-use-api/chat-server-api-list.md`):

1. The sender need not be a member.
2. They are NOT filtered by the profanity filter, pre-messaging webhooks or moderation unless Console "Moderate messages sent by server API" is on (Chat > Chat settings > Security & Moderation).
3. They are NOT in post-event webhooks unless "Include Server API Messaging in post-event webhooks" is on.
4. They do not appear in Console connection logs.

- **Group mute does not affect Platform Chat API sends** (`gag-user.md`).

**Ban vs expire:**

- `/v4/user/ban` disconnects the user at once and blocks reconnects. It is capped at 30 days and cannot be permanent. While banned, the user also cannot _receive_ messages or pushes. Messages from the ban period arrive after unban if they are ≤7 days old (`block.md`).
- `/v4/auth/access-token/expire` does not disconnect live sessions; it only blocks reconnects (`expire.md`).

**Token lifetime:**

- Tokens are valid indefinitely by default; the validity period can be changed **only in the Console** (no API is documented).
- The same `userId` can hold many valid tokens. Re-issuing overwrites the stored name and avatar.
- The docs suggest caching the token and serving the saved one on later logins (`register.md`).
- The open-channel quickstart shows a token response `{code:200, token}`, which conflicts with register.md's `{code:0,result:{accessToken}}`. Trust register.md.

**User IDs:** letters and digits only, ≤64 bytes (`register.md`). The docs' own webhook examples use `user_001`, and the Web examples use `my-group-id`, which contradicts that rule. Generate alphanumeric IDs to be safe.

### 3.5 Webhooks (later, not Day 2) (`/platform-chat-api/webhook/overview.md`)

- One URL per app (Console Chat > Chat settings > Webhooks > Config). Delivery is `POST` JSON `{type, id, time, data:[...]}`.
- Timeout is 5 s per attempt, with 2 retries (3 attempts total). Any 2xx counts as success. Circuit breaker: if 30 events in 1 minute all fail, delivery pauses for 1 minute.
- Inbound headers are `AppKey` (**no hyphen**), `Nonce`, `Timestamp` and `Signature`, where Signature = `sha1(AppSecret+Nonce+Timestamp)` in lowercase hex. The body is **not** covered by the signature, even though the page claims verification proves the payload was not tampered with. Add our own freshness and replay checks and make processing idempotent on `id`.
- `user:connection_status` status: `"0"` connected, `"1"` disconnected, `"2"` logged out. This is the **reverse** of the REST check, where "1" = online. Abnormal disconnects are reported up to 5 min late (`/platform-chat-api/webhook/user/connection-status.md`).
- Pre-messaging webhooks are available on Free and Pro, not Starter. If all 3 attempts time out, the original message is delivered, so the gate fails open (`/platform-chat-api/webhook/message/pre-messaging.md`).
- The page also lists source IPs per region.

## 4. Browser Chat SDK (`@nexconn/chat`)

### 4.1 Init, connect, connection status

- Order: `NCEngine.initialize()` → register custom messages and all handlers → `NCEngine.connect()` (`/chatsdk-web/listener.md`; `/chatsdk-web/message/customize.md`).
- `NCEngine.initialize({ appKey, areaCode?: AreaCode (default SG), logLevel?: LogLevel (default WARN) })` is synchronous and returns `void`. "Call it exactly once during the app lifecycle" (`/chatsdk-web/init.md`). The d.ts also has a hidden `naviServer?`; do not use it.
- `NCEngine.connect({ token }): Promise<NCResult<ConnectResult>>`. `NCResult` has `isOk` (same as `code === 0`), `code`, `msg` and `data?`; `ConnectResult` is `{ userId }`. Call `connect` once; the SDK reconnects every 5 s on its own (`/chatsdk-web/connection/connect.md`; `/chatsdk-web/connection/reconnect-kick.md`).
- `NCEngine.disconnect(disablePush?)` stops automatic reconnects. To switch users, call disconnect and then connect with the new token (`/chatsdk-web/connection/disconnect.md`).
- `NCEngine.addConnectionStatusHandler(id, new ConnectionStatusHandler({ onConnectionStatusChanged({ status, code }) {} }))`. Statuses: `CONNECTED 0`, `CONNECTING 1`, `DISCONNECTED 2`, `SUSPENDED 3`. The JSDoc spells it `onConnectionStateChanged`, which is wrong; the real name is `onConnectionStatusChanged`. Helpers: `getConnectionStatus()`, `getCurrentUserId()` (`/chatsdk-web/connection/listener.md`).
- Client codes (`/chatsdk-web/code.md`):

| Code    | Meaning                                            |
| ------- | -------------------------------------------------- |
| `31004` | token incorrect or expired; re-issue and reconnect |
| `31005` | App Key does not match the token                   |
| `31009` | user blocked                                       |
| `31010` | kicked by another device; no auto-reconnect        |
| `33001` | SDK not initialized                                |
| `33007` | auto-reconnect count exceeded; reconnect manually  |
| `34001` | navigation request failed                          |
| `34006` | App Key invalid                                    |
| `30002` | not connected                                      |
| `30004` | message frequency limit                            |
| `30007` | message rejected                                   |
| `30010` | open channel does not exist                        |
| `30014` | kicked from open channel                           |
| `33003` | open channel destroyed                             |

### 4.2 Handlers (`/chatsdk-web/listener.md`)

- `NCEngine.add/remove{ConnectionStatus,Message,Channel,User,OpenChannel,Translate,Tag,UserSettings,GroupChannel}Handler(uniqueId, ...)`. You can register several MessageHandlers under different IDs.
- `MessageHandler` callbacks (d.ts):
  - `onMessageReceived({messages})`
  - `onOfflineMessageSyncCompleted`
  - `onMessageDeleted({messages})`
  - `onMessagesUpdated({messages})`
  - `onMessageMetadataUpdated({messageId, channelIdentifier, metadata: Record<string,string>})`
  - `onMessageMetadataDeleted({messageId, channelIdentifier, keys})`
  - `onMessageReceiptResponse({responses})`
  - `onMessageBlocked({info})`
  - `onStreamMessageRequestInit({messageId})`
  - `onStreamMessageRequestDelta({messageId, chunkInfo:{content, messageContent}})`
  - `onStreamMessageRequestComplete({messageId, code})`
  - `onSpeechToTextCompleted`
  - `onCommunityChannelMessageMetadataChanged`

### 4.3 Message shape (d.ts beats `/chatsdk-web/message/receive.md`)

- Fields: `messageId`, `messageType`, `content`, `senderUserId`, `sentTime` (server time; use it for ordering), `metadata: Map<string,string>`, `direction`, `sentStatus`, `needReceipt`, `directedUserIds`, `updateInfo`, `hasChanged`, `clientId`, plus getters `isPersisted`, `isCounted` and `isStatusMessage`.
- **There is no top-level `channelId` or `channelType`.** Use `msg.channelIdentifier.channelType` and `msg.channelIdentifier.channelId`. The receive guide's table is wrong.
- One `onMessageReceived` gets messages from every channel type, so filter on `channelIdentifier`.

### 4.4 Custom messages (`/chatsdk-web/message/customize.md`; d.ts)

```ts
NCEngine.registerCustomMessages([{ messageType: "MG:Moment", isPersisted: true, isCounted: true }]); // before connect
await new GroupChannel(gid).sendMessage(new SendMessageParams<MomentPayload>(payload, "MG:Moment"));
```

- The field name is **`isPersisted`** (d.ts). `isPersited` on the guide page is a typo. `isPersisted` and `isCounted` are required; `isStatusMessage?` ("transient, not stored", per the d.ts JSDoc) and `remoteFileUrlField?` are optional.
- Avoid the `NC:` and `RC:` prefixes. Use the same `messageType` on every platform. "Unregistered types may not be properly decoded."
- `SendMessageParams` optional fields: `directedUserIds`, `disableNotification`, `disableUpdateLastMessage`, `needReceipt`, `metadata` (Record<string,string>), `pushConfig`, `onMessageInited`, `onMessageSending`.
- **Client send limit: 5 messages/s across all channels.** Messages over the limit are rejected (`/chatsdk-web/message/send.md`).
- Built-in types: TEXT `RC:TxtMsg` (Web content uses `text`; the server JSON uses `content`), IMAGE, FILE, GIF, HD_VOICE, LOCATION, REFERENCE, COMBINE, SHORT_VIDEO `RC:SightMsg`, STREAM `RC:StreamMsg`.

### 4.5 Message metadata (expansion)

- Supported in direct, group and system channels. **Not supported in open channels.** Metadata operation messages are kept 180 days (`/platform-chat-api/message/expansion-about.md`).
- Web (d.ts and API reference only; there is no Web guide for group or direct): `message.metadata` is a Map. `message.setMetadata(Record<string,string>)` and `message.deleteMetadata(keys)` both return `Promise<NCResult>`. Changes arrive through `onMessageMetadataUpdated` and `onMessageMetadataDeleted`.
- The only Web guide is for community channels, and it says 20 KV per message (`/chatsdk-web/community-channel/expand-message.md`). The server pages say 300. The Web group limit is undocumented.
- The server can get IDs of client-sent messages only through the `message:send` webhook (`get-expansion.md`).

### 4.6 Streaming receive (`/chatsdk-web/message/stream-msg.md`; d.ts)

- `onStreamMessageRequestInit`, then `Delta` (where `chunkInfo.messageContent` is the accumulated text), then `Complete`.
- The d.ts also has `message.requestStreamMessage(): Promise<NCResult<void>>`: "Requests the full content of a stream message. Stream message chunks will be delivered via onStreamMessageRequestDelta". The guide does not say whether deltas arrive automatically.
- `StreamMessageContent`: `content`, `type`, `isCompleted` (maps to engine `complete`), `completeReason`, `stopReason`, `senderUserInfo`, `mentionedInfo`, `extra`, `referMsg`.
- v26.2.1 fixed a "timeout interruption during downstream transfer of streaming message data" (`/chatsdk-web/release-notes.md`).

### 4.7 History (`/chatsdk-web/message/get-history.md`; d.ts)

- Web has no local message store; history always comes from the server (`/platform-chat-api/message/message-about/about-message-types.md`).
- `BaseChannel.createMessagesQuery({ channelIdentifier, startTime?, pageSize? (1–100, default 20), isAscending? (default false) })`, then `query.loadNextPage()`. The rows are in **`result.data.data`**. The query also has `hasNext` and `isLoading`, and `loadNextPage` returns a busy error if called while a load is running. There is no `endTime`. The example comment says `startTime` "fetches messages before this timestamp" (shown with descending order). Ascending behaviour is undocumented.
- `BaseChannel.getMessagesByIds({ channelIdentifier, messageIds })` returns `NCResult<Record<string, Message|undefined>>`. It is in the d.ts only; its limits are undocumented.
- Groups: new members see only messages sent after they joined, unless "Enable pre-join history access by new member" is on (Chat > Chat settings > Group Channels). Cloud retention is 180 days. The offline cache holds 1–7 days (default 7) (`/chatsdk-web/group-channel/overview.md`).
- Server sends with the default `isEchoToSender:0` are not in the sender's history ("must be set to 1 at send time for the message to be stored"). The sender's other devices catch up on the last 1 calendar day; recipients' missed messages are kept 7 days (`/platform-chat-api/message/how-to-sync-to-sender-client.md`).

### 4.8 Other client APIs

- Edit: `BaseChannel.updateMessage({messageId, channelIdentifier, content})`; receivers get `onMessagesUpdated`. Works in direct, group and community channels (`/chatsdk-web/message/modify-message.md`).
- Read receipts: `channel.sendReadReceiptResponse(ids)`, `onMessageReceiptResponse`, and for groups `BaseChannel.createMessagesReadReceiptUsersQuery({..., status: MessageReadReceiptStatus.READ})` (`/chatsdk-web/message/read-receipt.md`).
- Delete: `deleteMessagesForMe`, `deleteMessagesForMeByTimestamp`, `deleteMessageForAll` (by default only the sender can delete for everyone) (`/chatsdk-web/message/delete.md`).
- Groups (client): `new GroupChannel(id).join()` works only when "allow anyone to join" is on. Approval-required groups use a separate flow (`/chatsdk-web/group-channel/join-group.md`).

### 4.9 Open channels (watch party)

- The Web SDK **cannot create** open channels; the server creates them first (`/chatsdk-web/open-channel/join.md`).
- `new OpenChannel(id).enterChannel({ messageCount (required), extra? })` returns `NCResult<{createTime, participantCount, isAllChannelMuted, isCurrentUserMuted, isCurrentChannelMuted, isCurrentChannelInAllowlist, enterTime}>`. Leave with `exitChannel(extra?)`. The SDK rejoins automatically after an unexpected reconnect. **A user can be in one open channel at a time by default** (`/chatsdk-web/open-channel/join.md`; `/chatsdk-web/open-channel/quit.md`).
- `NCEngine.addOpenChannelHandler(id, new OpenChannelHandler({ onEntered, onEnterFailed, onExited, onChannelDestroyed, onMetadataChanged({changeInfo}), onMetadataSynced({channelId}), onParticipantChanged({actions}), onParticipantMuted, onParticipantBanned, onNotifyMultiLoginSync }))`. Register it before `enterChannel`. The shapes of `actions` and `changeInfo` are undocumented (`/chatsdk-web/open-channel/monitor-events.md`).
- Open-channel KV:
  - Calls: `channel.setMetadata({ metadata, deleteWhenLeft=false, overwrite=false })`, `getMetadata(key?)`, `deleteMetadata({keys})`.
  - Limits: ≤100 pairs per channel. Only the setter can change a key unless `overwrite` is true (otherwise `23424`).
  - Requirements: the metadata service must be enabled (otherwise `23426`).
  - Notifications are subject to the drop policy (`/chatsdk-web/open-channel/open-channel-kv.md`; `/platform-chat-api/open-channel/kv-attribute/open-channel-kv-about.md`).
- There are no offline messages and no push. History needs Open Channel cloud retention. Local messages are wiped on exit. By default the last 50 messages are delivered on join (`/chatsdk-web/open-channel/get-history-messages.md`; `/platform-chat-api/open-channel/service-config.md`).
- Lifetime: the channel is auto-destroyed after `ttlMinutes` (default 60) of no joins, leaves or messages. Keep-alive channels are capped and need the account manager (`1016`) (`/platform-chat-api/open-channel/destroy-about.md`; `code.md`).
- Offline participants are removed only when new messages arrive: the 31st message within 30 s offline, or the next message after 30 s. With no messages, offline users stay (`/platform-chat-api/open-channel/overview.md`).
- Drop policy: up to 40 messages per 200 ms per channel, and the newest messages are dropped first. Priority types and priority senders are protected (`/platform-chat-api/open-channel/whitelist/add-low-priority-message-type.md`).
- Console settings (Chat > Chat settings > Open Channels): "Allow participation in multiple channels" and "Restrict messaging to joined participants" are both off by default.

### 4.10 Built-in translation (`/chatsdk-web/builtin-translation/*.md`)

- **Off by default.** Enable it under Console Chat > Chat settings > Messages > Translation. The APIs are on `NCEngine.translateModule`; the handler is added with `NCEngine.addTranslateHandler`.
- The docs describe translating **text messages** only. Custom types are never mentioned.
- Calls:
  - `translateMessages({ list: TranslateMessageParam[] (≤10), force? , mode? })`, built with `new TranslateMessageParam(messageId, sourceLanguage, targetLanguage, text)`. **On Web, `text` is required**; if any item leaves it out, the whole request fails with `35060`.
  - `translateTexts({ list: TranslateTextParam[] (≤10), mode? })`, built with `new TranslateTextParam(text, source?, target?)`.
  - `mode` is only `TranslateMode.MECHANICAL` (0).
  - Each call resolves only to "accepted / not accepted". Results arrive in `TranslateHandler.onTranslationCompleted({ results })`.
- Each `TranslateResult` has:
  - `identifier`: the message ID, or an identifier "generated from the source text" for text requests.
  - `sourceType`: `MESSAGE` = 0, `CUSTOM_TEXT` = 1.
  - `code`: 0 means OK.
  - `translateInfo { targetLanguage, translatedText, status }`, where status is `NONE` 0, `TRANSLATING` 1, `SUCCESS` 2 or `FAILED` 3.
- User settings sync across devices: `setTranslationLanguage(code)`, `getTranslationLanguage()`, `setAutoTranslateEnabled(bool)`. Changes arrive through `onAutoTranslateStateChanged` and `onTranslationLanguageChanged`.
- `setTranslateStrategy(identifiers, TranslateStrategy.AUTO_ON)` **only stores a flag**: "The Chat SDK does not include built-in auto-translate functionality." The app must call translate itself.
- Codes: Hindi `hi`, English `en`, auto-detect `auto`; 211 languages in total (`supported-languages-and-codes.md`).
- Billing is per translated character. See section 9.

### 4.11 Online status (`/chatsdk-web/user/subscribe_online.md`)

- Subscribe: `NCEngine.userModule.subscribeEvent({ userIds, subscribeType: SubscribeType.ONLINE_STATUS, expiry? (s; omit for no expiry) })` returns `{code}`. Unsubscribe with `unsubscribeEvent` and the same shape.
- `NCEngine.addUserHandler(id, new UserHandler({ onSubscriptionChanged(e){ e.events }, onSubscriptionSyncCompleted(e){ e.type }, onSubscriptionChangedOnOtherDevices(e){} }))`.
- The maximum number of subscriptions is "limited", but the page gives no number. The feature "may require" enabling in the Console. The shape of each `events[]` item is undocumented.
- Client-side presence is supported on Free and Pro, **not Starter** (`/guides/realtime-chat/intro-chat/pricing-plans.md`).

### 4.12 Client moderation (`/chatsdk-web/moderation/*.md`)

- Profanity filter defaults:
  - It holds 50 words.
  - It checks only client-sent `RC:TxtMsg`.
  - Languages: Chinese, English, Japanese, German, Russian, Korean, Arabic. **Hindi is not supported.**
  - A match can be blocked or replaced. Replacement happens silently.
- Blocked sends show up in `MessageHandler.onMessageBlocked({info})`, or as an error code on the send, or are silently filtered, depending on configuration. The shape of `info` is undocumented.
- The client has no API for managing the word list; that is server-only.
- Auto moderation is paid (it needs a card; the first 10k text checks are free). Default languages are English and Arabic, and it covers built-in types only.

## 5. ChatUI (`@nexconn/chatui`)

### 5.1 Scope

- Supports Direct, Group and System channels; system channels are read-only. **Open channels are not supported** (`/chatui-web.md`; `/chatui-web/build-with-ai/troubleshooting.md`).
- Capability matrix: Message metadata **No**, Message search **No**, voice send not supported, typing indicator in direct only. Read receipts, unread, quote, forward, @mentions, pin and DND are Yes (`/chatui-web.md`).
- Streaming rendering, translation display, CSS variables and dark theme: **not documented anywhere** in `/chatui-web/*`.

### 5.2 Boot order (`/chatui-web/quickstart.md`)

```ts
import { NCEngine, AreaCode, LogLevel, ConnectionStatusHandler, GroupChannelIdentifier } from "@nexconn/chat";
import { NCChatUIApplication } from "@nexconn/chatui";
NCEngine.initialize({ appKey, areaCode: AreaCode.SG, logLevel: LogLevel.WARN });
const app = NCChatUIApplication.initialize({ hooks, language: "en_US" }); // null if not browser
if (!app) throw new Error("ChatUI initialize failed");
app.registerCustomMessages([...]);   // menus, switches, language packs, panel extensions: all BEFORE ready()
app.ready();                         // registers the custom elements
NCEngine.addConnectionStatusHandler("id", new ConnectionStatusHandler({ onConnectionStatusChanged({ status, code }) {} }));
const r = await NCEngine.connect({ token });
const root = document.createElement("nc-chat-ui-app-provider"); root.style.width = "100%"; root.style.height = "100%"; container.appendChild(root);
await app.openChannel(new GroupChannelIdentifier(groupId), true); // retry on 39005
```

- "Nexconn Chat owns the connection lifecycle." ChatUI uses the app's `NCEngine`.
- Initialize options:
  - `hooks` (required).
  - `language`: built-in `en_US` and `zh_CN`; anything else falls back to `en_US` (from source: it reads the page `lang` attribute first).
  - `logLevel`.
  - `allowedToRecallTime` (120 s), `allowedToReEditTime` (60 s).
  - `modalContainerId`.
- Lifecycle: `app.ifReady()`, `app.getCurrenUserId()` (the misspelling is real), `app.destroy()`.
- Behaviour of initialize after destroy is undocumented. From source: destroy resets the language to `zh_CN`, and tearing down the IM context also destroys ChatUI.
- The Vue example sets `isCustomElement`. There is no React or Next guidance.

### 5.3 Mount points (`/chatui-web/components.md`)

- Root: `nc-chat-ui-app-provider`.
- Children: `nc-channel-list-container-provider`, `nc-channel-list-provider`, `nc-channel-detail-provider`, `nc-channel-detail-bar-provider`, `nc-message-list-provider`, `nc-input-provider`. An app may embed only children.
- There is no exported tag enum.
- Layout setters (`/chatui-web/chat-ui/layout.md`): `setChannelBarSwitch(false)` hides the list, plus `setChannelDetailBackSwitch` and `setChannelBarTitle`. The typedoc says "mobile only", which conflicts with the layout page.

### 5.4 Hooks (`/chatui-web/user/hooks.md`)

```ts
export interface ServiceHooks {
  reqUserProfiles(userIds: string[]): Promise<ChatUIUserProfile[]>; // { userId; name; avatarUrl? }
  reqGroupProfiles(groupIds: string[]): Promise<GroupProfile[]>; // { groupId; name; avatarUrl?; memberCount }
  reqSystemProfiles(systemIds: string[]): Promise<ChatUISystemProfile[]>; // { systemId; name; avatarUrl? }
  reqGroupMembers(groupId: string): Promise<GroupMemberProfile[]>; // { userId; nickname? }
  getDefaultUserProfile?(userId: string): ChatUIUserProfile;
  getDefaultGroupProfile?(groupId: string): GroupProfile;
  getDefaultSystemProfile?(systemId: string): ChatUISystemProfile;
}
```

- Every returned profile needs a non-empty `name`, and `GroupProfile.memberCount` must be `>= 0`. ChatUI caches the results.
- Cache updates (after `ready()`): `updateUserProfile`, `updateGroupProfile`, `updateUserOnlineStatus(userId, online)`, `addGroupMembers`, `removeGroupMembers`, `updateGroupMembers`. These change the local cache only (`/chatui-web/user/update.md`).
- The typedoc examples use `portraitUri` and `targetId`, which are stale. Use the guide shapes.

### 5.5 Custom message rendering (`/chatui-web/chat/register-message.md`; source where the docs are silent)

```ts
app.registerCustomMessages([
  {
    messageType: "MG:Moment",
    isPersisted: true,
    isCounted: true,
    digest: (model, language) => "[Moment]",
    component: { tagName: "mg-moment", elementClass: MomentElement }, // runtime tag: nc-c-mg-moment
  },
]);
```

- ChatUI calls `NCEngine.registerCustomMessages(params)` internally (source `src/ui/index.ts`). Put every MG type in this **single** call. An entry without `component` (for example MG:Sync) creates no tag.
- From source, not the docs: the element gets the `ChatUIMessageModel` as a **JS property `.message`**, which may be reassigned. `ChatUIMessageModel` (API reference) exposes `content: T`, `message: Message<T>`, `messageType`, `senderUserId`, `channelIdentifier`, `sentTime`, `isStatusMessage` and more. Read `this.message.content.momentId`.
- The element sits inside a LitElement shadow root (source), so Tailwind does not reach it. Ship styles inside the element. A DOM event meant for React must use `bubbles: true, composed: true`.
- A type registered without a `component` renders as the "unsupported message" placeholder (source `context.ts`).
- Built-in menu items do not apply to custom types: REPLY covers text, image, file and reference; COPY covers text and reference. Threaded replies need a custom `MessageMenuItem` plus `MESSAGE_MENU_ITEM_CLICK` (`/chatui-web/chat-ui/message-menu.md`).
- `isPersisted:false` means items may not appear in history. Handle them through `UNSCHEDULED_MESSAGES` (`register-message.md`; `/chatui-web/event.md`).

### 5.6 Sending, events, configuration

- Send with `app.sendMessage(identifier, params)` and insert locally with `app.insertMessage(message)`. Prefer these over raw SDK sends into channels that ChatUI shows. Before `ready()` they return `39001` (`/chatui-web/chat/manage-message.md`).
- Events: `app.addEventListener(ChatUIEvents.X, fn)`.
  - Dispatch modes: 0 = app first, can `preventDefault`; 1 = both run; 2 = app only.
  - Notable events: `MESSAGE_WILL_SEND` (since 26.2.4; mutate `params` synchronously; cannot cancel), `CHANNEL_SELECTED`, `UNSCHEDULED_MESSAGES`, `MESSAGE_MENU_ITEM_CLICK`, `ALERT_EVENT`, `TOAST_EVENT` (`/chatui-web/event.md`).
- Switches, set before `ready()`: `app.setCommandSwitch(ChatUICommand.SHOW_MESSAGE_STATE | MENTION_ALL | ..., bool)` (`/chatui-web/chat-ui/switch.md`).
- Styling:
  - `cloneMessageBubbleConfig()`/`setMessageBubbleConfig()`: field `redius` (misspelled), hex-integer colors, `BubbleLayout`.
  - `cloneChannelsItemConfig()`/`setChannelsItemConfig()`.
  - Both are set before `ready()`; nothing else is documented (`/chatui-web/chat-ui/message-bubble.md`; `channel-list.md`).
- Localization: there is no `hi_IN` pack. Order: `cloneLanguageEntries('en_US')` → translate → `registerLanguagePack('hi_IN', entries, 'ltr')` **before `ready()`** → `app.ready()` → `app.setLanguage('hi_IN')` **after** `ready()` (`/chatui-web/localization.md`).
- The cross-platform overview warns "Avoid calling Chat SDK APIs directly when using Chat UI". The Web quickstart itself calls `NCEngine` directly, so for Web the narrower rule is to prefer `app.sendMessage` for channels that ChatUI shows (`/guides/sdk-libraries/client-sdks/chatUI.md` vs `/chatui-web/quickstart.md`).

## 6. Call SDK (later; not Day 2)

- Install: `@nexconn/engine @nexconn/chat @nexconn/call`. Version peers currently conflict (section 1) (`/callsdk-web.md`).
- Requirements: an HTTPS or localhost page and `getUserMedia` permission.
- Order: `NCCallEngine.install()` → `NCEngine.initialize` → `NCCallEngine.initialize({})` → `NCEngine.connect` must succeed before any call API (otherwise `80012`).
- Register `setCallEventHandler` straight after initialize, or `onCallReceived` never fires.
- Group voice: `startCall({ calleeIds, callType: NCCallType.MULTI, mediaType: NCCallMediaType.AUDIO })` returns `{code, callId?, busyLineUserList?}`. Limits are 32 audio or 16 video participants. **Billing starts when the call is created.** An empty `calleeIds` is rejected (`80007`) (`/callsdk-web/group-call.md`; `/callsdk-web/one-to-one-call.md`).
- `acceptCall`, `joinCall` (its params are never shown), `endCall(params?)`, `inviteToCall`.
- `getOngoingCallLogs()` returns only calls the user previously joined or was invited to.
- Nexconn generates the room ID, and room ID = callId. A user can be in one call at a time (`80002`), and **`acceptCall` while already in a call ends the current one silently**.
- `setLocalVideoView` is required "before placing or answering a call". Whether that applies to audio-only calls is undocumented.
- Calling must be enabled in the Console; otherwise `80006` (the "RTC service purchase page"). The Free plan "is available for Nexconn Chat only". No Call pricing or free minutes are documented (`/callsdk-web/code.md`; `/guides/calls/overview.md`; pricing-plans.md).

## 7. Limits

| Item                        | Value                                                                                   | Source                                            |
| --------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Default REST rate           | 100/s per App Key. Over the limit: HTTP 429, business code `1008`                       | `/platform-chat-api/prepare-to-use-api/limits.md` |
| Group send                  | 20/s per app, counted per target group                                                  | `send-group.md`                                   |
| Message metadata set/delete | 100/s total, 20/s for group, **and it uses the group-send (20/s) quota**                | `limits.md` Known issues                          |
| Token issue                 | 200/s                                                                                   | `register.md`                                     |
| Open-channel server send    | 100/s                                                                                   | `send-open-channel.md`                            |
| System send                 | 100 msgs/s per recipient                                                                | `send-private.md`                                 |
| Client send                 | 5 msgs/s across all channels                                                            | `/chatsdk-web/message/send.md`                    |
| Web group query API         | 5 req/s (`25416`)                                                                       | `code.md`                                         |
| Content                     | custom ≤10 KB (server); serialized ≤128 KB; plan character limit 15K (Free) / 20K / 25K | `send-group.md`; `about-message-types.md`         |
| Group members               | 300 by default                                                                          | `/chatsdk-web/group-channel/overview.md`          |
| Group admins                | 10 (admin page) vs 20 (code `25419`); the docs conflict                                 | `add-group-channel-admins.md`; `code.md`          |
| Groups per user             | 1,000 on Free; the overview also says "no limit" (conflict)                             | group overview                                    |
| Open channels               | 50 concurrent on Free; participants unlimited; 1 per user by default                    | `/platform-chat-api/open-channel/overview.md`     |
| Stream                      | 30 min, 128 KB                                                                          | `code.md`                                         |

## 8. Free tier and plan facts (`/guides/realtime-chat/intro-chat/pricing-plans.md` unless noted)

- The Free plan is **valid for one month** from app creation, needs no card, and covers Chat only. After it expires the app is blocked until a paid plan is chosen, and you cannot return to Free.
- Up to 2,000 MAU. PCC is capped at 5% of the MAU tier, which is **about 100** concurrent connections (derived; the page does not print 100). Free has no overage, so once a cap is exceeded new connections fail.
- Registered users: code `2007` says "In development, up to 100 users can be registered. In production without a paid IM plan, 100 free registrations"; deactivated users count. `/platform-chat-api/user/overview.md` says unlimited. **Assume 100.**
- **Translation:** 10,000 characters on Free, then $0.02 per 1,000 characters, which needs a card. Usage is charged daily, and any day under 1,000 characters is billed as 1,000. On Free without a card, translation turns off once the allowance is spent. The docs do not say whether the 10k is monthly or one-off, or whether the daily minimum draws down the free allowance.
- Starter loses client presence, pre-messaging webhooks and low-priority message types.
- Auto moderation is "Supported" on Free but needs a payment method.

## 9. Margin mapping

| Margin feature               | Nexconn API                                                                                                                                                                                                               | Notes / source                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign in to chat              | Server `/v4/auth/access-token/issue`; browser `NCEngine.initialize` + `NCEngine.connect({token})`                                                                                                                         | Cache the token in Redis. On `31004`, re-issue. `register.md`, `connect.md`                                                                                          |
| Nexconn user ID              | `userId` letters and digits, ≤64                                                                                                                                                                                          | Map Margin IDs to alphanumeric (strip hyphens from cuid/uuid). `register.md`                                                                                         |
| Lecture room                 | Server `/v4/group-channel/create` (owner = system user `marginbot`) + `/v4/group-channel/join`                                                                                                                            | channelId alphanumeric. Treat `25409`/`25412` as OK. 300-member cap.                                                                                                 |
| Ask a doubt (`MG:Moment`)    | Server `/v4/group-channel/message/send` with `fromUserId=<student>`, `messageType:"MG:Moment"`, `content: JSON.stringify(...)`, `isEchoToSender:1`, `hasMetadata:true`, `metadata:{upvotes:"0",status:"open",pinned:"0"}` | Moderate and check mute/ban **before** sending (mute does not apply, moderation is off by default). Postgres stays the source of truth.                              |
| Votes / status / pin         | Server `/v4/channel-type/message/metadata/set` (channelType 3); browser `onMessageMetadataUpdated`                                                                                                                        | Shares the 20/s group quota, so batch it. ChatUI does not render metadata.                                                                                           |
| `MG:MomentUpdate`            | Server group send, `fromUserId=marginbot`                                                                                                                                                                                 | May be redundant with metadata, since both use the same 20/s quota. Decide after Day 2.                                                                              |
| Moment list / windowed reads | Postgres index (tSec → messageId) + `BaseChannel.getMessagesByIds`                                                                                                                                                        | History pages by `sentTime` only.                                                                                                                                    |
| Room chat drawer             | ChatUI `nc-chat-ui-app-provider` + `app.openChannel(new GroupChannelIdentifier(id))`                                                                                                                                      | Custom element `mg-moment`. Shadow DOM styling.                                                                                                                      |
| DMs                          | ChatUI built-in list / `openChannel(new DirectChannelIdentifier(peer))`                                                                                                                                                   | The app server enforces DM restrictions (`/platform-chat-api/user/overview.md`).                                                                                     |
| AI answer streaming          | Server `/v4/group-channel/message/stream/send` (`fromUserId=marginbot`); browser `onStreamMessageRequest*`                                                                                                                | ChatUI streaming render is undocumented, so build a custom panel.                                                                                                    |
| Translation hi↔en            | `translateModule.translateMessages` (text messages) / `translateTexts` (moment text); results via `TranslateHandler`                                                                                                      | Enable in the Console. Cache in Postgres by (momentId, lang). Quota is small.                                                                                        |
| Watch party                  | Server `/v4/open-channel/create` (`ttlMinutes`) / `/destroy`; browser `OpenChannel.enterChannel`, `sendMessage(SendMessageParams(…,"MG:Sync"))`                                                                           | Not ChatUI. Late-join snapshot via open-channel KV (needs the service). Add `MG:Sync` to priority types and the host to priority senders. Max 50 concurrent on Free. |
| Presence                     | Browser `userModule.subscribeEvent(ONLINE_STATUS)`; webhook `user:connection_status` later                                                                                                                                | Mind the reversed status codes (REST vs webhook).                                                                                                                    |
| Read receipts                | `channel.sendReadReceiptResponse`; group send `needReadReceipt:1`                                                                                                                                                         | `read-receipt.md`                                                                                                                                                    |
| Mute (room chat)             | `/v4/group-channel/user/mute-list/add`                                                                                                                                                                                    | Affects only client SDK sends.                                                                                                                                       |
| Ban                          | `/v4/user/ban` + `/v4/auth/access-token/expire` + Margin ban table                                                                                                                                                        | ≤30 days, so Margin re-applies longer bans.                                                                                                                          |
| Profanity                    | Built-in filter for `RC:TxtMsg` (no Hindi); Margin's own filter for MG:Moment                                                                                                                                             | `/chatsdk-web/moderation/profanity-filter.md`                                                                                                                        |
| Notifications                | `/v4/system-channel/message/send` `fromUserId=marginbot`                                                                                                                                                                  | How clients display custom system types is undocumented.                                                                                                             |
| Voice huddle                 | Call SDK `startCall(MULTI, AUDIO)`                                                                                                                                                                                        | Later. May need a paid RTC service.                                                                                                                                  |

## 10. Not documented / must test on Day 2

1. Does a **server-sent** registered custom type (`MG:Moment`, content a JSON string) arrive in the browser with `msg.content` as an **object**, or as a string?
2. Does `onMessageReceived` fire for the author's own server-sent message with `isEchoToSender:1`, and with what `direction`?
3. Do **other** members get `onMessageMetadataUpdated` when **our server** calls `metadata/set`?
4. Can a browser call `message.setMetadata()` on a server-sent message that has `hasMetadata:true`? On a client-sent message with no initial `metadata`?
5. Is `message.metadata` filled on messages returned by `createMessagesQuery` and `getMessagesByIds`?
6. Streaming: do `onStreamMessageRequestInit/Delta/Complete` fire on their own, or only after `message.requestStreamMessage()`? Does `onMessageReceived` fire for `RC:StreamMsg`?
7. Does `translateMessages` accept the messageId of a **custom type** if we supply `text`? Is the `translateTexts` identifier deterministic, and can it be matched back to its text?
8. How many translation characters a test uses, and whether the 1,000-character daily minimum draws down the free 10k.
9. Server send of a type registered with `isStatusMessage:true` or `isPersisted:false`: is it stored, shown, or dropped? Does ChatUI show `MG:MomentUpdate` as a placeholder?
10. Are hyphens or underscores accepted in group and open channel IDs, and in user IDs? (The rule says alphanumeric; the examples break it.)
11. Does the group `owner` (and `userIds`) in group create have to be a registered user? (Issue a token first to be safe.)
12. `/v4/auth/access-token/expire` `userIds` type (String or array).
13. Which `AreaCode` matches the app's data center, especially SA.
14. Does `app.openChannel` work for a group the user has not joined?
15. Does the ChatUI custom element really get `.message` (`ChatUIMessageModel`) as a property in 26.2.5?
16. ChatUI under React 19 StrictMode and HMR: re-initialize after `destroy()`?
17. `userIds` charset on `/v4/user/connection-status/get` and the presence subscription cap.
18. Must online-status subscription be enabled in the Console on Free?
19. Is `MG:Sync` (a custom type) accepted on the open-channel priority type list? Does open-channel KV need a Console or ticket step?
20. Client send rate (5/s) as observed. Error code seen when it is exceeded (`30004`?).
21. Which error the Web client sees when it is banned mid-session (`31009`?), or when its token expires mid-session.
22. The exact join date of the Free plan (the one-month clock) for this App Key.
23. Call SDK: Free plan eligibility, pricing, and `joinCall` params. Deferred.
