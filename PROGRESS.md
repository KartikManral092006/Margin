# Margin progress

Read this first at the start of every session. Update it at the end of every day.

## Status

| Day | Date      | Work         | Status                                                                  |
| --- | --------- | ------------ | ----------------------------------------------------------------------- |
| 1   | Sun Nov 1 | Scaffold     | Done locally; CI pending first push                                     |
| 2   | Mon Nov 2 | Nexconn test | Go: G0, G2, G3, G5 pass, G1 likely; G4 and G6 not yet recorded          |
| 3   | Mon Nov 2 | Auth         | Done locally (built a day early); Google and email need your keys       |
| 4   | Mon Nov 2 | Rooms        | Done (built two days early); review fixes applied                       |
| 5   | Mon Nov 2 | Moments      | Done (built three days early); live Nexconn delivery 0.8-0.9 s          |
| 6   | Mon Nov 2 | Threads      | Done (built four days early); jump to 30:00 loads in 130 ms             |
| 7   | Mon Nov 2 | P0           | **P0 reached**: presence, room chat, phone polish, Playwright E2E green |

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
- Dev gates: `NODE_ENV !== "production"` **and** `NEXCONN_DEV_ROUTES=1`, enforced in `proxy.ts` (real 404 for `/dev/*`), the page, and both API routes. The API routes also reject cross-site and non-JSON requests (`lib/request-guard.ts`), and `pnpm dev` listens on loopback only (`-H localhost` since Day 3), so other devices on the Wi-Fi cannot reach it. `.env.example` ships `NEXCONN_DEV_ROUTES=0`; set it to 1 in your own `.env`.
- Review: 3 reviewers (SDK correctness, security, Next/React) plus a verifier per finding. 4 confirmed and fixed: failover race on concurrent failures, LAN exposure of dev routes, cross-site POSTs to dev routes, engine state lost on Fast Refresh.
- Tests: signer, REST client (failover, errors, signing), API wrappers, message helpers, IDs, env.

Verified locally without keys: lint, typecheck, unit tests, build; `/dev/*`, token and dev routes return 404 in a production build; lab renders in dev; token route returns 503 `nexconn_not_configured`; no secret or SDK in server API chunks.

### How to run the live test (needs your keys; uses a small amount of quota)

1. Nexconn Console > Key Management (console.nexconn.ai/agile/apps/km): copy the App Key and App Secret into `.env` (`NEXCONN_APP_KEY`, `NEXCONN_APP_SECRET`), set `NEXCONN_AREA` to the app's data center (SG, NA or SA), enable Translation.
2. `pnpm db:up && pnpm dev`, open `http://localhost:3000/dev/nexconn` in Chrome (devalice) and in an incognito window (devbob).
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

## Day 3: auth (built Nov 2)

Done:

- **Better Auth 1.7.14**, not Auth.js. The plan put Auth.js v5 first; it was checked and dropped. Its README and discussion #13252 say it is now maintained by the Better Auth team for security fixes only and recommend Better Auth for new projects, v5 is still `beta.32` (last release Jul 20), and `@auth/prisma-adapter` is typed against `@prisma/client`, which doesn't resolve with Prisma 7's `prisma-client` generator. Pinned to 1.7.14 because pnpm's `minimumReleaseAge` (1 day) blocks 1.7.15, published Nov 1; none of 1.7.15's fixes touch the features we use. Don't add release-age exclusions.
- Migration `0002_auth`: `users`, `sessions`, `accounts`, `verifications` (Better Auth's core schema). `User` gains `emailVerified` and `updatedAt`; `nexconnUserId` is nullable (Better Auth's runtime schema check expects that) but always set (see decisions).
- `features/auth/server/auth.ts`: lazy `getAuth()` (so CI builds without `AUTH_SECRET`), Prisma adapter, magic link (10 min, single use, stored hashed), Google (only when both keys are set), 30-day DB sessions, telemetry off, rate limits stored in Redis, client IP from `AUTH_IP_HEADER` / `AUTH_TRUSTED_PROXIES`.
- Pages: `/sign-in` (magic link + Google, loading/sent/error states), `/sign-in/confirm` (the emailed link lands here; one click spends the token), `/home` (protected; shows the user, sign-out), `app/error.tsx` (branded error page with retry). Sign-out is a server-action form that works without JS.
- `proxy.ts`: optimistic cookie check for `/home/*` (307 to `/sign-in?callbackURL=…`); every page re-checks with `verifySession`. The `/dev` guard is unchanged.
- Email: `features/email/server/resend.ts` (fetch, 5 s timeout, idempotency key, one retry only when retryable). Without `EMAIL_API_KEY`, development logs the link to the terminal; production refuses (503 `EMAIL_NOT_CONFIGURED`).
- Limits (Redis): 3 links per address per 15 min, 10 per IP per day (only when the IP is known), 90 per day in total (Resend Free allows 100), Better Auth per-IP rules raised for a class behind one campus NAT (60/min Google, 30/min magic link, 60/min verify), 5 Nexconn token refreshes per user per 10 min.
- `POST /api/nexconn/token` now issues tokens for the **signed-in user** (401 otherwise); the body can't name a user. The lab sends `{devUser}`, accepted only when dev routes are enabled.
- CI secret scan now builds with **sentinel values** and greps for those values in `.next/static` and the prerendered HTML/RSC shells. The old name-based grep failed on Better Auth's client env helper, which contains the string `AUTH_SECRET` but never a value.
- `pnpm dev` now runs `next dev -H localhost` (was `127.0.0.1`): cookies and Better Auth's origin check need one host, and Google OAuth accepts `localhost`.
- Review: 3 reviewers (security, Better Auth/Next correctness, regressions) plus a skeptic per finding. 12 of 13 findings confirmed and fixed: open redirect through dot segments (`/.//evil.com`), session cookie never refreshed (fixed with `SessionRefresher`, refresh off in Server Components), class-sized NAT rate limits, one client spending the daily email cap, client IP config, magic-link login CSRF and link scanners (confirm page + same-origin check on verify), CI scan scope, localhost vs 127.0.0.1, Google 429 message, "use Google" shown when Google is off, Google button stuck after Back (bfcache), no error page. Rejected: reserved display names (names are not a trust boundary; bot messages must be recognised by sender ID, never by name).

Verified: format, lint, typecheck, 129 unit tests, production build without secrets, sentinel scan with a positive control. Live (dev, no Google or email keys): signed-out `/home` redirects; link request, confirm page, sign-in; cookie HttpOnly + SameSite=Lax; `id = nexconnUserId`; link reuse gives `INVALID_TOKEN`; scanner or cross-site hits on verify don't spend the token; open-redirect attempts go to `/home`; forged cookie redirects without a loop; cross-site POST 403; token route 401/400; sign-out form clears cookies and the session row; 4th link for one address 429. In headless Chrome at 375 px: the sign-in form sends a link, `/home` refreshes the session, and a Postgres outage shows the Margin error page.

Not done (needs you):

1. **Google OAuth client** (Google Cloud Console > Credentials > OAuth client ID > Web application). Authorized JavaScript origin `http://localhost:3000`; redirect URI `http://localhost:3000/api/auth/callback/google`. Put the values in `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. While the consent screen is in "Testing", only listed test users can sign in; publish it before launch.
2. **Email**: done Nov 2. Resend domain `mail.joinmargin.tech` verified (receiving off); `EMAIL_FROM=login@mail.joinmargin.tech`; a test send to `delivered@resend.dev` was accepted. Domain `joinmargin.tech` will also be the production URL (Day 14). Original notes: Resend account (Free: 100/day, 3,000/month). Resend only delivers to your own address until you verify a domain you own, e.g. a free one from the GitHub Student Developer Pack, with a subdomain such as `mail.<domain>`. Then set `EMAIL_API_KEY` and `EMAIL_FROM=login@mail.<domain>`. Start this early; DNS takes time.
3. Test Google sign-in and Google ↔ magic-link sign-in on the same email (account linking) once keys exist.

## Day 4: rooms (built Nov 2)

Done:

- Migration `0003_rooms`: `lectures` and `lecture_memberships`, enums `Visibility` and `Role`. One public room per video through a **partial unique index declared in the schema** (`previewFeatures = ["partialIndexes"]`, `@@unique([youtubeId], where: { visibility: "public" })`). `memberCount` changes only in the join transaction. `durationSec` stays null (no trusted source yet). `metaFetchedAt` records when the title was fetched.
- `features/lectures/shared/youtube.ts`: URL parser (exact host list, 11-character case-sensitive ID, `t=`/`start=` in 90, 90s, 1m30s, 1h2m3s forms), 64-case test table.
- `features/lectures/server/oembed.ts`: title and channel from YouTube oEmbed (no key), fixed endpoint, canonical URL built from the parsed ID, 4 s timeout, 64 KB cap, errors mapped to `video_not_found` / `video_unavailable` / `youtube_unavailable`; cached in Redis (1 day, misses 10 min).
- `features/lectures/server/lectures.ts`: race-safe `findOrCreatePublicLecture` (P2002 on the partial index, read the winner), `joinLecture`, `listPublicLectures` (recent/popular, escaped search), `getLectureForViewer` (404 for missing or non-public).
- Routes: `GET/POST /api/lectures`, `POST /api/lectures/[id]/join` (Postgres only), `POST /api/lectures/[id]/chat` (lazy Nexconn: token, group create with marginbot as owner, join; idempotent; 503 `chat_unavailable` on failure; not called by any UI yet), `GET /open` (paste target; real 307s; sends signed-out users through sign-in).
- Pages: landing and `/home` paste form (works without JS), `/home` recent and popular lists, `/lectures/new` (first paster confirms; server action creates), `/lectures/[id]` (player, clock, member count, copy link, join, player error states), `app/not-found.tsx`.
- `features/player/`: IFrame API loader, `useYouTubePlayer` (nocookie host), time store on `useSyncExternalStore` (polls every 250 ms only while playing; `getTime`, `seek`, `setRate` in 0.25 steps) and `useRoom()` for Days 5-8.
- Limits: 20 new rooms per user per day, 500 in total; Nexconn group creation 200 per day, **fail-closed** if Redis is down.
- CI: schema drift check (`prisma migrate diff --exit-code`) and the Postgres integration test (`pnpm test:int`).

Verified: format, lint, typecheck, 278 unit tests, integration test (20 concurrent pastes give 1 room; concurrent joins keep `memberCount` exact; private rows ignored), drift check 0. Live with Nexconn and email disabled: signed-out paste goes through sign-in and back; the first paster sees the oEmbed title and creates the room; the second account pasting the `youtu.be` form lands in the same room (2 members); two accounts creating a new room at the same moment get the same room (one 201, one 200); join idempotent; chat 503 `nexconn_not_configured`; bad hosts, private rooms, unknown videos rejected; 0 Nexconn calls. Headless Chrome at 375 px: player 375x211, no horizontal scroll, nocookie embed honours `t=`.

Not done:

1. Review (3 reviewers + skeptics, Nov 2): 8 confirmed and fixed in `day-04: review fixes`: per-user Nexconn group budget (5/day) plus a per-room Redis lock (parallel `/chat` calls spent the global 200/day); per-user preview limit on `/lectures/new` and a global oEmbed cap (120/min); room lists show only rooms you joined (an unlisted YouTube video would otherwise be listed for everyone until the Data API gives `privacyStatus`); 8 KB JSON body cap (`readJsonBody`); YouTube loader and player readiness timeouts (15 s, then "Try again" really reloads); seek before ready is queued; paste errors rendered on the server so they show without JS. Rejected: 3 (quota spent before validation, integration test skipping in CI).
2. One live Nexconn check of `/chat` (1 group create, 2 joins, 2 extra registered users, no MAU) before Day 5. Needs your OK.
3. YouTube Data API key for the Made-for-Kids check (YouTube developer policy), duration and privacy status. Needs your decision before launch; the 30-day title refresh job also lands before launch.

## Day 5: moments (built Nov 2)

Done:

- Migration `0004_moments`: `moments` (tSec in whole seconds, body, parentId for replies one level deep, status, upvotes, pinnedAt/pinnedBy, `clientId` with a unique `(userId, clientId)` so a retried POST is idempotent, `sendStatus` pending/sent/failed + `sendAttempts` + `nexconnMessageId`).
- `GET /api/lectures/[id]/moments?from=&to=` (window up to 30 min) or `?ids=`; `POST` (session, same-origin JSON, 8 KB body, 10 posts/min/user, auto-joins the room, body normalized and capped at 1,000 characters).
- Delivery: **Postgres first**. After the response (`next/server` `after`), the server sends `MG:Moment` to the room's group **as marginbot**, carrying the whole doubt (author name, clientId, createdAt; a superset of the Day 2 schema). Browsers accept `MG:Moment` only from marginbot, so a member sending a fake one from their own client is ignored. Failed or skipped sends (no group yet) are resent after the next post and as soon as `/chat` creates or joins the group; 3 attempts max.
- Room UI (`features/moments/`): **D** (or the "Ask at 12:34" button) opens the composer with the time captured when it opens; Enter posts, Shift+Enter new line, Esc closes. The list is placed by second, highlights doubts within 10 s of the playhead, and clicking a time seeks. Optimistic add with rollback on 4xx and retry on network errors. The list covers 15 minutes around the playhead and reloads when you move 5 minutes (Day 6's "jump to 30:00 loads that window" works already). Status shows "Live" or "Updating every few seconds" (5 s polling without Nexconn, a 30 s safety refresh while live).
- The room joins chat on mount, so a room's Nexconn group is now created on its first visit (still once per room, within the Day 4 per-user and global group budgets).
- `pnpm dev` now deletes `.next` before starting. Turbopack's dev cache went stale three times today after the server was stopped and files were regenerated (Prisma client, route types), and every page then reloaded itself forever (HMR `restart` on connect).

Verified: format, lint, typecheck, 344 unit tests, 8 integration tests (10 concurrent identical posts give 1 row; reply rules; window bounds; resend rules), drift check 0, production build with the sentinel secret scan clean. Offline (Nexconn and email off): two accounts, B sees A's doubt by polling in 4.2 s at the right second; idempotent retry, validation errors, auto-join. **Live over Nexconn** (approved; the two test accounts were mapped to the existing `devalice`/`devbob` identities, so no new Nexconn users or MAU): B saw A's doubt in **812 ms and 915 ms** after A pressed Enter. Slower runs came from this network: a TCP connect to `api.sg-light-api.com` sometimes takes 7.6 s (measured), and the first send after a server restart timed out once; those doubts still arrive through the resend and refresh paths.

Not done:

1. Clicking a doubt's time before the video started showed 0:00 in headless runs: fixed on Day 6 (seek settling).
2. The Nexconn group `lec…` created for the deleted test room still exists in Nexconn (harmless).

## Day 6: threads, votes, resolve, markers (built Nov 2)

Done:

- Migration `0005_votes`: `votes` (one row per person per moment). `Moment.upvotes` changes only in the same transaction as the Vote row, so double clicks and races can't drift it. No votes on your own doubt; a vote can be taken back.
- `POST`/`DELETE /api/moments/[id]/vote`, `POST /api/moments/[id]/resolve` (`{resolved}`; only the asker, top-level only; Day 10 adds answerers and hosts), `GET /api/lectures/[id]/moments/markers` (top-level doubts in 15-second buckets for the whole lecture). Acting on a moment joins the room.
- Replies: `parentId` one level deep; the server stores a reply at its parent's second whatever the client sends.
- Live updates: after a vote or status change the server sets the counts as **Nexconn message metadata** on the moment's `MG:Moment` (the Day 2 G3 mechanism). Browsers treat it as "this moment changed" and re-read it from our API (metadata can't prove who set it). Live `MG:Moment` signals only add doubts a browser doesn't have; they never overwrite fuller API data (a resent signal used to reset counts to 0).
- UI: "▲ n · Me too" button (optimistic, reverted on refusal), Reply thread with its own composer, "Mark resolved"/"Reopen" for the asker and a Resolved badge, and a markers bar under the player (never over it) whose markers seek on click. The time store holds a seek target for 2 s (YouTube briefly reports the old time) and polls every second while paused (dragging YouTube's own seek bar reloads the right window).
- Fixes found in live testing: two people opening a brand-new room together made the second `/chat` fail ("busy") and that browser never went live; the server now waits up to 4 s for the other request to create the group and the browser retries 503s with backoff. Signals skipped before a room had its group are now resent up to 20 at a time (it was 3).

Verified: format, lint, typecheck, 355 unit tests, 15 integration tests (6 concurrent votes from 3 people give 3; unvote once; own-vote and cross-lecture refusals; resolve permissions; reply time; marker buckets), drift 0, production build and secret scan clean. API: every rule above returned the expected status. **Done when, in two headless browsers at 375 px:** B opens the room at 0:00 and sees only the 0:45 doubt; clicking the 30:00 marker loads the 29:55, 30:02 and 30:30 doubts in **130 ms** and the clock shows 30:00. Live over Nexconn (devalice/devbob identities again, no new Nexconn users; 3 groups created in total): a new doubt arrives in 0.33-0.47 s, an upvote shows for the asker in 1.0-1.3 s, a reply in 0.8-0.9 s, Resolved in 2.5-4.1 s (an extra API read plus Nexconn latency from this network). Going live takes 7-17 s here; until then the room polls every 5 s.

Not done:

1. Subagents stalled all day (three probes hit the 600 s watchdog), so Days 5 and 6 had no independent review. Run one when they work.
2. Test rooms' Nexconn groups (3) remain in Nexconn (harmless).

## Day 7: presence, room chat, polish, P0 gate (built Nov 2)

Done:

- **Presence** (`features/presence/`): each viewer sends a heartbeat every 10 s and when their 30-second window changes (`POST /api/lectures/[id]/presence`); Redis keeps a per-room sorted set of last-seen times plus a hash of positions, and drops anyone silent for 45 s (keys expire when a room goes quiet). `GET /api/lectures/[id]/presence` is a Server-Sent Events stream: a snapshot every 3 s (only when it changed), a keep-alive comment every 15 s, closed after 10 minutes (EventSource reconnects). Each viewer's snapshot excludes them and carries display names only, never user ids. Closing the tab sends a `sendBeacon` leave. The room shows initials and "Ana, Ravi and 3 others are here · 12 watching this lecture".
- **Room chat** (`features/chat/`): our own component on the Nexconn SDK (ChatUI doesn't support portrait phones): plain text to the lecture's group from the browser, the last 30 messages from Nexconn history, live messages from the connection, names from `GET /api/lectures/[id]/people` (room members only). Doubts and Room chat are tabs; pressing D on the chat tab switches to Doubts.
- **DMs moved to Day 10** (decision): the plan pairs them with answerers and the inbox, and ChatUI (the planned DM UI) can't render on phones, so building them now would give a desktop-only feature in a phone milestone. Moved, not dropped.
- Polish: every main screen reviewed at 375 px from screenshots (landing, sign-in, home empty, confirm page, room with doubts, thread, chat tab, not-found); the markers bar gained a time scale. Loading, empty and error states exist on every room panel.
- **P0 gate**: Playwright 1.64.1 (`pnpm test:e2e`), using the installed Chrome (no browser download). Its own dev server on port 3100 with `NEXT_DIST_DIR=.next-e2e` (never shares a cache with `pnpm dev`), Nexconn and email off; sign-in links are read from that server's log; E2E accounts (`@e2e.test`) are deleted afterwards. Test: A signs in, pastes a link, opens the room, asks at 0:12 with D; B on a 375 px phone signs in, lands in the same room, sees the doubt pinned to 0:12 with no horizontal scroll, and votes "Me too". Plus a signed-out redirect test. Added to CI with the Redis integration test.
- Fix: the player's `getTime()` (heartbeats, composer) now honours the 2 s seek settling too; presence followed a jump only after 13 s before, 3.2 s after.

Verified: format, lint, typecheck, 380 unit tests, 16 integration tests (Postgres + Redis), drift 0, **E2E 2/2 passing**, production build and secret scan clean. Live over Nexconn (devalice/devbob identities, no new Nexconn users): each browser shows the other at its moment; when one jumps away the other updates in 3.2 s; a chat message reaches the phone in 0.4-0.7 s with the sender's name, and history loads.

Not done:

1. Subagents still stall (four probes hit the 600 s watchdog), so Days 5-7 have had no independent review. Run one when they work.
2. Going live takes 15-25 s on this network (slow connections to Nexconn's Singapore API); rooms poll every 5 s meanwhile.

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
- Schema fixes to apply when the tables land: `Moment.pinnedAt/pinnedBy`; separate `LectureMembership` and `CourseMembership`; partial unique indexes through Prisma's native `partialIndexes` preview feature (a hand-written SQL index gets dropped by the next `migrate dev`; test the HNSW index the same way before Day 11); vote count updated in the same transaction as the vote.
- Embedding model must be chosen before Day 11 (it fixes the `vector(N)` size).
- Auth is Better Auth (see Day 3). Env names stay `AUTH_*`; never set `BETTER_AUTH_SECRET` or `BETTER_AUTH_URL` (Better Auth reads them as fallbacks).
- User IDs are 32 letters and digits, set in `user.create.before`, and `nexconnUserId = id` in the same INSERT. Registration with Nexconn happens on the first token request, not at sign-up: sign-in never depends on Nexconn, and only people who open chat count toward Nexconn MAU. ("Nexconn user created on first sign-in" in the plan now means "ID reserved at sign-up, registered on first connect".)
- `proxy.ts` only checks that the session cookie exists. Every protected page calls `verifySession`, every route and action reads the session itself. Never redirect `/sign-in` away in the proxy (a stale cookie would loop).
- Server Components read sessions with refresh off (they can't set cookies); `SessionRefresher` in `app/(app)/layout.tsx` refreshes through the route handler.
- Every redirect target from user input goes through `safeCallbackPath` (checked after URL parsing).
- Magic links land on `/sign-in/confirm`; the verify endpoint only accepts same-origin navigations.
- Before launch: set `AUTH_IP_HEADER` (or `AUTH_TRUSTED_PROXIES`) for the chosen host, otherwise per-IP limits put all users in one bucket. Check it on staging with a forged `X-Forwarded-For`.
- Sign-up is open to everyone (owner, Nov 2).
- Never `findUnique`/`upsert` a lecture by `youtubeId`: the unique index is partial and Prisma drops the predicate. Use `findFirst` with `visibility: "public"`.
- Rooms work from Postgres alone. Nexconn group create and join happen lazily in `POST /api/lectures/[id]/chat`, never on page view or join. A public room's creator is a `member`; `host` is for private class rooms (deferred, with Course/Unit/CourseMembership).
- With streaming metadata, a page-level `redirect()`/`notFound()` returns HTTP 200 and acts in client JS for normal browsers (curl gets a real 307/404). Redirects that must work without JS live in `proxy.ts`, route handlers or server actions.
- Dev reload loop (Nov 2): every page reloaded itself continuously. Fixed by deleting `.next` and restoring iCloud-evicted files; don't share `.next` between `pnpm build` and `pnpm dev` runs.
- Room chat is our own component on the Nexconn SDK; DMs and the inbox land on Day 10 with answerers.
- Votes and status changes go out as message metadata on the moment's MG:Moment; clients re-read the moment from the API. Live signals never overwrite API data.
- Room moments are sent by marginbot, never by the author, and clients ignore `MG:Moment` from anyone else. Postgres is the truth; the signal is for speed.
- The working copy is `~/code/Margin` (outside iCloud). `~/Desktop/Margin` is stale and holds the local `backup-before-rewrite` branch.
- pnpm's 1-day `minimumReleaseAge` stays on; pin an older version instead of adding exclusions.
- The project lives in `~/Desktop`, which is synced to iCloud with "Optimize Mac Storage". On Nov 2 iCloud had evicted ~25,000 files in `node_modules` and 118 source/`.git` files, so reads hung (`prisma` never started). Fix used: `brctl download` for source files, delete and reinstall `node_modules`. Long-term fix: move the repo out of Desktop/Documents (e.g. `~/code/margin`).

## Open issues

- Day 2: record G4 (stream) and G6 (ChatUI) results; confirm G1's senderUserId.
- Day 3: Google keys, Resend domain, then test Google sign-in and account linking (see Day 3 "Not done").
- Push to GitHub and get a first green CI run (needs the repo URL and your OK).
- Confirm the Nexconn plan bills $0 (see the plan section above).
