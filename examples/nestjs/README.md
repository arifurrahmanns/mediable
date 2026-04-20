# NestJS example

Minimal NestJS app wired to `mediable`. Uses PostgreSQL (default database name `mediable` on `localhost:5432`).

## Setup

Start a Postgres instance. Using Docker:

```bash
docker run --name mediable-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=mediable \
  -p 5432:5432 -d postgres:16
```

Or set `DATABASE_URL` in your environment to point at your own instance.

```bash
pnpm install
pnpm dev                          # starts http://localhost:3000
```

The `media` table is auto-created on first request (`autoMigrate: true`).

Upload a test file:

```bash
curl -X POST http://localhost:3000/users/u1/avatar \
  -F 'file=@./your-image.jpg;type=image/jpeg'

curl http://localhost:3000/users/u1/avatar
```

## Decorator-style uploads

NestJS ships `FileInterceptor` + `@UploadedFile()`, backed by multer — feels like Laravel's controller injection:

```ts
@Post('users/:id/avatar')
@UseInterceptors(FileInterceptor('file'))
async upload(
  @Param('id') id: string,
  @UploadedFile() file: Express.Multer.File,
) {
  return media.addMedia({ model: { type: 'User', id }, file, collection: 'avatars' })
}
```

`mediable.addMedia()` accepts `Express.Multer.File` natively — no buffering glue.

## Switching to SQLite / MySQL / MongoDB

Change the `database` block in `src/media.ts`:

```ts
database: { provider: 'sqlite', connection: { filename: './storage/media.db' }, autoMigrate: true }
database: { provider: 'mysql',  connection: { url: process.env.DATABASE_URL! }, autoMigrate: true }
database: { provider: 'mongodb',connection: { url: process.env.MONGO_URL! } }
```

## Layout

- `src/media.ts` — `mediable({ ... })` config
- `src/media.controller.ts` — controller routes
- `src/app.module.ts` — root module
- `src/main.ts` — Nest bootstrap
