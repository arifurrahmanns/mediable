# Express + Prisma example

Minimal Express app wired to `better-media` with Prisma (SQLite dev DB).

## Setup

```bash
pnpm install              # installs deps, runs `prisma generate`
pnpm db:migrate           # creates storage/dev.db + the `media` table
pnpm dev                  # starts http://localhost:3000
```

Upload a test file:

```bash
curl -X POST http://localhost:3000/users/u1/avatar \
  -F 'file=@./your-image.jpg;type=image/jpeg'

curl http://localhost:3000/users/u1/avatar
```

## Layout

- `prisma/schema.prisma` — the `Media` model. Uses SQLite for dev; swap `provider = "postgresql"` (+ `url = env("DATABASE_URL")`) for prod.
- `src/prisma-media-adapter.ts` — thin `DatabaseAdapter` that translates between the library and Prisma.
- `src/media.ts` — `betterMedia({ database: prismaAdapter(prisma), ... })`.
- `src/server.ts` — routes that call `media.addMedia()`, `media.stream()`, etc.
