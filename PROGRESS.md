# Margin progress

Read this first at the start of every session. Update it at the end of every day.

## Status

| Day | Date      | Work         | Status                              |
| --- | --------- | ------------ | ----------------------------------- |
| 1   | Sun Nov 1 | Scaffold     | Done locally; CI pending first push |
| 2   | Mon Nov 2 | Nexconn test | Not started                         |

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
- Vitest: 8 env tests. CI workflow: format, lint, typecheck, tests, migrations against pgvector, build, client-bundle secret scan.

Verified locally: `pnpm db:up`, `pnpm db:deploy`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, health 200, health 503 with Redis stopped, secret scan clean.

Not done:

- Push to GitHub and a green CI run (waiting for the repo URL and OK to push).
- Empty `features/*` folders were not created; each appears on the day its first file lands.

## Decisions (do not re-litigate without a reason)

- Next 16: route guards go in `proxy.ts` (not `middleware.ts`); `next lint` is gone, use `pnpm lint`.
- Cache Components is on: any route or page that reads the DB, Redis, cookies or headers must call `await connection()` or another request-time API, or wrap cached reads in a `"use cache"` helper.
- Optional secrets in `lib/env.schema.ts` become required on the day their feature lands.
- Hosting must be a long-running container (SSE presence and Redis need open connections). No serverless.
- Watch-party sync uses a server clock offset (`GET /api/time`, NTP-style), never raw `Date.now()` across machines.
- YouTube playback rate only takes 0.25 steps; drift correction uses 1.25× / 0.75× for a computed duration.
- Schema fixes to apply when the tables land: `Moment.pinnedAt/pinnedBy`; separate `LectureMembership` and `CourseMembership`; partial unique indexes (public `youtubeId`, one active party) and the HNSW index as raw-SQL migrations; vote count updated in the same transaction as the vote.
- Embedding model must be chosen before Day 11 (it fixes the `vector(N)` size).

## Day 2 checklist (Nexconn test)

You:

- [ ] Nexconn app created, Translation enabled, App Key and App Secret pasted into `.env` only.

Claude:

- [ ] Read the Nexconn Web docs: SDK install, `NCEngine.connect`, token issuing (server SDK), custom message registration, message metadata, streaming, translation, ChatUI mounting.
- [ ] `POST /api/nexconn/token` with the App Secret in a `server-only` module.
- [ ] Test page: ChatUI via `next/dynamic` with `ssr: false`; send and receive `MG:Moment` between two browsers; metadata; translation Hindi to English.
- [ ] Make `NEXCONN_APP_KEY` / `NEXCONN_APP_SECRET` required in the env schema.
- [ ] Write go / no-go here, and apply the recovery-plan row if any check fails.

Open questions for Day 2:

- Does the browser SDK need the App Key at init (so it must be `NEXT_PUBLIC_`)?
- Which ChatUI profile hooks are required (`/api/chatui/users`, `/groups`, `/members`)?
- Translation: per-message request or automatic by user language?

## Open issues

- None yet.
