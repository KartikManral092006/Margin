# Margin

Ask your doubt at the exact second of a YouTube lecture, see who else is at that moment, and learn together. Built for the Reskilll × Nexconn challenge (Social & Community track).

## Requirements

- Node.js 20.19+ (22 recommended)
- pnpm (`corepack enable pnpm`)
- Docker Desktop

## Local setup

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:deploy
pnpm dev
```

Open http://localhost:3000. `http://localhost:3000/api/health` should return `{"status":"ok","db":"ok","redis":"ok"}`.

Postgres (with pgvector) runs on port 5435 and Redis on port 6380.

## Scripts

| Script            | Does                               |
| ----------------- | ---------------------------------- |
| `pnpm dev`        | Development server                 |
| `pnpm build`      | Production build                   |
| `pnpm lint`       | ESLint                             |
| `pnpm typecheck`  | Route type generation and `tsc`    |
| `pnpm test`       | Unit tests (Vitest)                |
| `pnpm format`     | Prettier                           |
| `pnpm db:up`      | Start Postgres and Redis           |
| `pnpm db:migrate` | Create and apply a migration (dev) |
| `pnpm db:deploy`  | Apply migrations                   |

## Secrets

Never commit `.env`. Every variable is listed in `.env.example` without values.
