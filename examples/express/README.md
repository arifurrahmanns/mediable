# Express example

Minimal Express app wired to `mediable`. Defaults to SQLite so you can run it with no external services.

## Setup

This example lives in a pnpm workspace — install and run with pnpm.

```bash
pnpm install                      # links the workspace `mediable` package
pnpm dev                          # starts http://localhost:3000
```

The `media` table is auto-created on first request (`autoMigrate: true`).

Upload a test file:

```bash
curl -X POST http://localhost:3000/users/u1/avatar \
  -F 'file=@./your-image.jpg;type=image/jpeg'

curl http://localhost:3000/users/u1/avatar
```

## Switching to Postgres / MySQL / MongoDB

Change the `database` block in `src/media.ts`:

```ts
database: {
  provider: 'postgres',
  connection: { url: process.env.DATABASE_URL! },
  autoMigrate: true,
}
// → pnpm add pg
// → set DATABASE_URL in .env
// → start the app — autoMigrate creates the table on first use.
//   (Or run `pnpm migrate` to apply the schema upfront.)
```

Same shape for `mysql` (`pnpm add mysql2`) and `mongodb` (`pnpm add mongoose`).

## Layout

- `src/media.ts` — `mediable({ database: { provider, connection }, ... })`
- `src/server.ts` — routes that call `media.addMedia()`, `media.stream()`, `media.verifySignedToken()`, etc.
