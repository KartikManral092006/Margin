# Margin progress

Read this first at the start of every session. Update it at the end of every day.

## Status

| Day | Date      | Work         | Status                                                              |
| --- | --------- | ------------ | ------------------------------------------------------------------- |
| 1   | Sun Nov 1 | Scaffold     | Done locally; CI pending first push                                 |
| 2   | Mon Nov 2 | Nexconn test | Code done (built early on Nov 1); live two-browser run pending keys |

## Plan risks found on Nov 1 (need a decision from Kartik)

From `docs/nexconn.md` §8 (Nexconn pricing page and error codes). These affect the 21-day plan itself:

1. **Registered-user cap.** Error `2007` says the Free plan allows **100 registered users** (deactivated users count). The plan targets **150+ learners**. Options: a paid IM plan before the Day 14 launch, or reuse IDs only for real users (no test users beyond devalice/devbob/marginbot). Confirm the real cap in the Console on Day 2.
2. **Free plan expires one month after app creation**, then the app is blocked until a paid plan is chosen. Judging runs Nov 23–27. Record the app creation date; if it is before Oct 27, judging falls outside the free month.
3. **About 100 concurrent connections** on Free (5% of 2,000 MAU). A full watch party plus class launch can hit it.
4. **Translation: 10,000 characters free**, then a card is needed. Cache every translation in Postgres by (momentId, lang) and never re-translate.
5. **Call SDK (voice huddle, Day 18):** the Free plan "is available for Nexconn Chat only". Calling may need a paid RTC service; no free minutes are documented. Check the challenge FAQ's "add a card for 10,000 minutes" claim in the Console.
6. **ChatUI does not support portrait mobile browsers** and does not render message metadata or open channels. The definition of done requires phone width, so the room UI (moments, votes, party chat) must be our own React components on the raw SDK; ChatUI is only usable for desktop DMs.

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

1. Nexconn Console: copy the **development** App Key and App Secret into `.env` (`NEXCONN_APP_KEY`, `NEXCONN_APP_SECRET`), set `NEXCONN_AREA` to the app's data center (SG, NA or SA), enable Translation.
2. `pnpm db:up && pnpm dev`, open `http://127.0.0.1:3000/dev/nexconn` in Chrome (devalice) and in an incognito window (devbob).
3. Both: pick the user, **Connect**. One of them: **Setup dev group**.
4. Run G1–G6 in order (client moment, server moment, upvote server then browser, stream, Hindi text then translate, ChatUI). Copy each event log here.

Quota used by one full run: 3 registered users (devalice, devbob, marginbot), about 15 REST calls, about 4 translations of about 40 characters. No AI API calls.

### Go / no-go (fill in after the live run)

| ID  | Check                                                     | Result | Fallback if it fails                                      |
| --- | --------------------------------------------------------- | ------ | --------------------------------------------------------- |
| G0  | Token issued, both browsers CONNECTED                     |        | Check area vs data center, dev vs prod key                |
| G1  | Client `MG:Moment` arrives decoded in the other browser   |        | Moments as text + Postgres structure                      |
| G2  | Server-sent `MG:Moment` arrives (and echoes to author)    |        | Optimistic insert from the API response                   |
| G3  | Other browser gets `onMessageMetadataUpdated` from server |        | Votes in Postgres, live updates over our SSE              |
| G4  | Stream renders incrementally                              |        | Post the AI answer as one message, or stream over our SSE |
| G5  | Hindi → English via `translateMessages`                   |        | `translateTexts` for moments, cached by (momentId, lang)  |
| G6  | ChatUI mounts and renders the `mg-moment` bubble          |        | Custom React list; ChatUI only for DMs                    |

Overall go for Day 3 = G0–G3 pass.

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
- Plan risks 1–6 above need decisions before Day 14.
