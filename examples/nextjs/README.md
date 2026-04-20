# Next.js example (App Router)

Minimal Next.js 15 app wired to `mediable`. Uses PostgreSQL (default database name `mediable` on `localhost:5432`).

## Setup

Start a Postgres instance. Using Docker:

```bash
docker run --name mediable-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=mediable \
  -p 5432:5432 -d postgres:16
```

Or set `DATABASE_URL` in `.env.local` to point at your own instance — Next.js loads it automatically.

```bash
pnpm install
pnpm dev                          # starts http://localhost:3000
```

Open http://localhost:3000 — there's a form that uploads an avatar for user `u1`. The `media` table is auto-created on first request (`autoMigrate: true`).

## Why no multer / busboy?

Next.js App Router route handlers receive the Fetch API `Request` — `await req.formData()` is built in and returns native `File` objects, which `mediable.addMedia()` accepts directly.

## Route layout

| File | Purpose |
|---|---|
| `app/page.tsx` | Upload form + renders current avatar (RSC reads `media.getFirst()`) |
| `app/api/users/[id]/avatar/route.ts` | `POST` (upload), `GET` (fetch record + URLs) |
| `app/api/media/[id]/route.ts` | `GET` (stream bytes, optional `?conversion=thumb`), `DELETE` |
| `app/api/signed/[token]/route.ts` | Terminator for signed URLs produced by `media.temporaryUrl()` |
| `src/lib/media.ts` | `mediable({ ... })` config |

## Switching to SQLite / MySQL / MongoDB

Change the `database` block in `src/lib/media.ts`:

```ts
database: { provider: 'sqlite', connection: { filename: './storage/media.db' }, autoMigrate: true }
database: { provider: 'mysql',  connection: { url: process.env.DATABASE_URL! }, autoMigrate: true }
database: { provider: 'mongodb',connection: { url: process.env.MONGO_URL! } }
```

## Runtime

All API routes pin `export const runtime = 'nodejs'` — mediable uses `node:fs`, sharp, pg, etc., so the edge runtime won't work. `next.config.ts` marks `mediable`, `sharp`, and `better-sqlite3` as `serverExternalPackages` to keep them out of the client bundle.
