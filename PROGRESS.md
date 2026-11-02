# Margin progress

Read this first at the start of every session. Update it at the end of every day.

## Status

| Day | Date      | Work         | Status                                                              |
| --- | --------- | ------------ | ------------------------------------------------------------------- |
| 1   | Sun Nov 1 | Scaffold     | Done locally; CI pending first push                                 |
| 2   | Mon Nov 2 | Nexconn test | Code done (built early on Nov 1); live two-browser run pending keys |

## Nexconn plan and remaining risks (updated Nov 2)

**Plan:** Kartik selected **Pro, 10,000 MAU** on Nov 2, meant to be the free offer announced Oct 22, 2026 (10,000 MAU, Pro features, 500 peak concurrent connections, 10 GB storage, 180-day history, no card; enroll by sending one message before Dec 31, 2026). **Confirm in the Console billing page that the price is $0, not the paid Pro 10k tier ($860/month).**

With this plan the old Free-plan risks (100-registration cap, one-month expiry, ~100 concurrent connections, Starter-only feature gaps) no longer apply, provided the billing check above passes.

Remaining risks:

1. **Translation quota** is not mentioned in the offer; assume 10,000 characters. Cache every translation in Postgres by (momentId, lang) and never re-translate.
2. **Call SDK (voice huddle, Day 18)** is not covered by the chat offer. Per the challenge FAQ, a card unlocks 10,000 free call minutes; check that it is not a plan fee before adding it.
3. **ChatUI does not support portrait mobile browsers** and does not render message metadata or open channels. The definition of done requires phone width, so the room UI (moments, votes, party chat) must be our own React components on the raw SDK; ChatUI is only usable for desktop DMs.
4. **Traction proof uses Console active users.** Each app has **one** App Key for development, testing and release (`/chatsdk-web.md`), so dev tests (devalice, devbob, marginbot) count as users too. Keep test users to those three.

## Nexconn Console settings checklist

Most are in Console > Chat > Chat Settings (console.nexconn.ai/agile/im/service/config), inside the named section.

| When   | Section                    | Setting                                                  | Value                                      |
| ------ | -------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| Day 2  | Billing                    | Plan price                                               | Confirm $0 (free 10k-MAU offer)            |
| Day 2  | Messages                   | Translation                                              | Enable                                     |
| Day 2  | Group Channels             | Enable pre-join history access by new member             | Enable                                     |
| Always | Key Management             | App Secret                                               | Never reset (invalidates all tokens)       |
| Day 7  | Users (if present)         | Online status subscription                               | Enable if a switch exists                  |
| Day 8  | Open Channels              | Open channel metadata (KV)                               | Enable                                     |
| Day 8  | Open Channels              | Restrict messaging to joined participants                | Enable                                     |
| Day 8  | Open Channels              | Allow participation in multiple channels                 | Leave off                                  |
| Day 13 | Security & Moderation      | Moderate messages sent by server API                     | Enable                                     |
| Day 14 | Webhooks                   | Webhook URL                                              | Production URL (only if webhooks are used) |
| Day 14 | Messages                   | Include Server API Messaging in post-event webhooks      | Enable together with webhooks              |
| Day 14 | Allowed domains (if asked) | Production domain                                        | Add                                        |
| Day 18 | Call > Call Subscription   | Calling (card for 10,000 free minutes per challenge FAQ) | Activate; confirm no monthly fee           |

## Day 1: scaffold (Nov 1)

Done:

- Own git repo in `~/Desktop/Margin` (the home folder is also a git repo, so never run git from `~`).
- Next.js 16.4.3 (App Router, Turbopack, Cache Components on), React 19.3, Tailwind 4, shadcn/ui (Radix base): button, input, card, sonner, skeleton.
- Strict TypeScript plus `noUncheckedIndexedAccess`, `noImplicitOverride`. ESLint flat config, Prettier with the Tailwind plugin.
- `compose.yaml`: Postgres 17 + pgvector on **5435**, Redis 7 on **6380**, with healthchecks. `margin_test` database is created on first start.
- Prisma **7.10.1** pinned (npm `latest` is an 8.0 RC). `prisma-client` generator outputs to `lib/generated/prisma` (gitignored, regenerated on `postinstall`). Migration `0001_init` enables `vector`.
- `lib/env.schema.ts` (pure zod schema, tested), `lib/env.ts` (`server-only`), `lib/env.client.ts` (only `NEXT_PUBLIC_*`).
- `lib/db.ts` (Prisma + `PrismaPg` singleton), `lib/redis.ts` (ioredis singleton), `lib/logger.ts` (pino with redaction).
- `GET /api/health`: 200 `{db:"ok",redis:"ok"}`, 503 when a dependency is down (2 s timeout per check).
- Landing page placeholder in `app/(marketing)/page.tsx`.
- Vitest env tests. CI workflow: format, lint, typecheck, tests, migrations against pgvector, build, client-bundle secret scan.

Not done:

- Push to GitHub and a green CI run (waiting for the repo URL and OK to push).

## Day 2: Nexconn proof (code written Nov 1)

Done:

- `docs/nexconn.md`: Nexconn reference built from the docs by 5 readers, each checked by an independent verifier, plus the shipped `.d.ts`. Section 10 lists what must be tested live.
- Packages pinned exactly: `@nexconn/engine@26.2.1`, `@nexconn/chat@26.2.1`, `@nexconn/chatui@26.2.5`, `lit@3`. `@nexconn/call` is **not** installed (its peers conflict with chat 26.2.1).
- No Node server SDK exists. `features/nexconn/server/`: `sign.ts` (SHA-1 of secret+nonce+timestamp), `client.ts` (REST client, 5 s timeout, primary/backup host failover; sends never auto-retry), `api.ts` (token, ban, expire, groups, group send, metadata, stream chunks, open channels, system messages), `tokens.ts` (Redis token cache, 7 days), `index.ts` (`server-only`).
- `features/nexconn/shared/`: area hosts, ID rules (letters and digits only), `MG:*` schemas, content and metadata encoding, error codes.
- `features/nexconn/client/`: `engine.ts` (dynamic import of the SDKs, one-time initialize, handlers to an event bus, token refresh on `31004`), ChatUI registration with an `mg-moment` custom element (shadow DOM, emits `mg-seek`).
- Routes: `POST /api/nexconn/token`, `POST /api/dev/nexconn` (setup, moment, metadata, momentUpdate, stream), page `/dev/nexconn` (the lab).
- Dev gates: `NODE_ENV !== "production"` **and** `NEXCONN_DEV_ROUTES=1`, enforced in `proxy.ts` (real 404 for `/dev/*`), the page, and both API routes. The API routes also reject cross-site and non-JSON requests (`lib/request-guard.ts`), and `pnpm dev` listens on 127.0.0.1 only, so other devices on the Wi-Fi cannot reach it. `.env.example` ships `NEXCONN_DEV_ROUTES=0`; set it to 1 in your own `.env`.
- Review: 3 reviewers (SDK correctness, security, Next/React) plus a verifier per finding. 4 confirmed and fixed: failover race on concurrent failures, LAN exposure of dev routes, cross-site POSTs to dev routes, engine state lost on Fast Refresh.
- Tests: signer, REST client (failover, errors, signing), API wrappers, message helpers, IDs, env.

Verified locally without keys: lint, typecheck, unit tests, build; `/dev/*`, token and dev routes return 404 in a production build; lab renders in dev; token route returns 503 `nexconn_not_configured`; no secret or SDK in server API chunks.

### How to run the live test (needs your keys; uses a small amount of quota)

1. Nexconn Console > Key Management (console.nexconn.ai/agile/apps/km): copy the App Key and App Secret into `.env` (`NEXCONN_APP_KEY`, `NEXCONN_APP_SECRET`), set `NEXCONN_AREA` to the app's data center (SG, NA or SA), enable Translation.
2. `pnpm db:up && pnpm dev`, open `http://127.0.0.1:3000/dev/nexconn` in Chrome (devalice) and in an incognito window (devbob).
3. Both: pick the user, **Connect**. One of them: **Setup dev group**.
4. Run G1–G6 in order (client moment, server moment, upvote server then browser, stream, Hindi text then translate, ChatUI). Copy each event log here.

Quota used by one full run: 3 registered users (devalice, devbob, marginbot), about 15 REST calls, about 4 translations of about 40 characters. No AI API calls.

### Go / no-go (fill in after the live run)

| ID  | Check                                                     | Result                                                                                                                                                                     | Fallback if it fails                                      |
| --- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| G0  | Token issued, both browsers CONNECTED                     | Pass (Nov 2): both browsers connected                                                                                                                                      | Check area vs data center, dev vs prod key                |
| G1  | Client `MG:Moment` arrives decoded in the other browser   | Likely pass: B received a new MG:Moment (D1J7-DGJK-TCQF-GGC8) after A sent a client moment; client text (RC:TxtMsg) from A also reached B. Confirm senderUserId in the log | Moments as text + Postgres structure                      |
| G2  | Server-sent `MG:Moment` arrives (and echoes to author)    | Pass: devbob server moment reached devalice decoded as an object with initial metadata; author also receives its own echo (direction 1)                                    | Optimistic insert from the API response                   |
| G3  | Other browser gets `onMessageMetadataUpdated` from server | Pass: both browsers got metadataUpdated upvotes 1 then 2 within seconds                                                                                                    | Votes in Postgres, live updates over our SSE              |
| G4  | Stream renders incrementally                              |                                                                                                                                                                            | Post the AI answer as one message, or stream over our SSE |
| G5  | Hindi → English via `translateMessages`                   | Pass after enabling Translation in Console (was 28400): Hindi text to "hello, this is a question of the class." via onTranslationCompleted, identifier = messageId         | `translateTexts` for moments, cached by (momentId, lang)  |
| G6  | ChatUI mounts and renders the `mg-moment` bubble          |                                                                                                                                                                            | Custom React list; ChatUI only for DMs                    |

Overall go for Day 3 = G0–G3 pass.

Also learned on Nov 2: `translateMessages` accepts a custom `MG:Moment` messageId when `text` is supplied (accepted, code 0, result via `onTranslationCompleted`), so Day 12 can translate moments with Nexconn directly.

## Decisions (do not re-litigate without a reason)

- Next 16: route guards go in `proxy.ts` (not `middleware.ts`); `next lint` is gone, use `pnpm lint`.
- Cache Components is on: any route or page that reads the DB, Redis, cookies or headers must call `await connection()`. Pages that must block (for a real 404 or redirect) also set `export const instant = false`.
- Secrets are **required at call time**, not in the env schema: `getNexconn()` throws `NexconnNotConfiguredError` (503). CI builds without Nexconn keys.
- App Key reaches the browser through `/api/nexconn/token`, not a `NEXT_PUBLIC_` variable.
- Nexconn user, group and channel IDs are letters and digits only (`toNexconnId` strips the rest).
- Group sends and stream chunks never auto-retry (no idempotency key in the API); idempotent calls retry once on the backup host.
- All `MG:*` types are registered in one call (ChatUI forwards it to `NCEngine.registerCustomMessages`).
- Hosting must be a long-running container (SSE presence and Redis need open connections). No serverless.
- Watch-party sync uses a server clock offset (`GET /api/time`, NTP-style), never raw `Date.now()` across machines.
- YouTube playback rate only takes 0.25 steps; drift correction uses 1.25× / 0.75× for a computed duration.
- Schema fixes to apply when the tables land: `Moment.pinnedAt/pinnedBy`; separate `LectureMembership` and `CourseMembership`; partial unique indexes (public `youtubeId`, one active party) and the HNSW index as raw-SQL migrations; vote count updated in the same transaction as the vote.
- Embedding model must be chosen before Day 11 (it fixes the `vector(N)` size).

## Open issues

- Live Day 2 run (G0–G6) waits on the Nexconn keys.
- Confirm the Nexconn plan bills $0 (see the plan section above).
