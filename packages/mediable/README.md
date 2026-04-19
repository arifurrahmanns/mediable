# mediable

[![npm version](https://img.shields.io/npm/v/mediable.svg)](https://www.npmjs.com/package/mediable)
[![license](https://img.shields.io/npm/l/mediable.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/mediable.svg)](https://nodejs.org)

Headless, framework-agnostic media library for Node.js.

Attach files (images, docs, video) to any model (`User`, `Product`, `Post`, …) with named collections, image conversions, pluggable storage (local FS, S3-compatible) and four built-in databases (SQLite, PostgreSQL, MySQL, MongoDB).

**Headless by design.** No router, no handler, no framework adapters. You already have routes, auth middleware, and a multipart parser in your app — `mediable` just gives you the functions: `media.addMedia(...)`, `media.get(...)`, `media.url(...)`, `media.stream(...)`, `media.delete(...)`. Call them from your own Express / Hono / Fastify / NestJS / Next.js / Bun / Deno route — no wiring.

> **Status:** v0.1.0 — first public release. Core + local storage + SQLite / Postgres / MySQL / MongoDB + Sharp + BullMQ + `init` and `migrate` CLI + Express example. 24/24 tests pass (20 in-memory + 4 live Postgres). S3 driver, responsive-images plugin, and browser client SDK land in later milestones.

---

## Table of contents

- [Install](#install)
- [Quick start](#quick-start)
  - [Option A — scaffold with the CLI](#option-a--scaffold-with-the-cli-recommended)
  - [Option B — write the config by hand](#option-b--write-the-config-by-hand)
- [Core concepts](#core-concepts)
- [Configuration](#configuration)
  - [Owners, collections, and conversions](#owners-collections-and-conversions)
  - [Database](#database)
  - [Storage](#storage)
  - [Image processor](#image-processor)
  - [Queue](#queue)
  - [Events](#events)
- [API reference](#api-reference)
  - [Conversion fallback](#conversion-fallback)
- [Recipes](#recipes)
- [Database schema](#database-schema)
- [Type reference](#type-reference)
- [Security](#security)
- [Roadmap](#roadmap)

---

## Install

```bash
pnpm add mediable
```

One install. Sharp, better-sqlite3, and BullMQ are bundled as dependencies and loaded lazily — you only pay runtime cost for what you actually import.

| Import | What loads |
|---|---|
| `import { mediable, LocalStorage } from 'mediable'` | Core only |
| `import { sharpProcessor } from 'mediable/sharp'` | Sharp native bindings — only if you opt in |
| `import { bullmqQueue } from 'mediable/bullmq'` | BullMQ + ioredis — only if you opt in |
| `import { mongooseAdapter } from 'mediable/mongoose'` | Mongoose — only if you opt in or pick `provider: 'mongodb'` |

TypeScript-first. Publishes ESM + CJS. Requires Node 20+. Install size is ~100MB because of Sharp and BullMQ — if that's a dealbreaker, open an issue.

---

## Quick start

### Option A — scaffold with the CLI (recommended)

```bash
pnpm add mediable
npx mediable init
```

`init` prompts you for:

- **Config file path** (default `src/media.ts`)
- **Database** — SQLite, PostgreSQL, MySQL, MongoDB, or Custom (bring your own adapter)
- **Connection** — SQLite filename, or `DATABASE_URL` / `MONGO_URL` env variable
- **Queue** — in-process (default) or BullMQ (asks for `REDIS_URL`)
- **Local storage root** (default `./storage/media`)
- **Example owner** — opt-in `User.avatars` with a `thumb` conversion

It writes a tailored `media.ts`, prints the `MEDIA_SECRET` to paste into your `.env`, and tells you the next step: run `npx mediable migrate` to create the schema.

Non-interactive: `npx mediable init -y` accepts defaults (SQLite + in-process + example owner).

### Option B — write the config by hand

**1. Install.**

```bash
pnpm add mediable
```

**2. Create the config file.** Point it at a database — SQLite works out of the box, Postgres/MySQL/MongoDB just need a `DATABASE_URL`. See [Database](#database) for all four shapes.

```ts
// src/media.ts
import { mediable, LocalStorage } from 'mediable'
import { sharpProcessor } from 'mediable/sharp'

export const media = mediable({
  secret: process.env.MEDIA_SECRET!,           // required, min 16 chars

  // Pick your database. `autoMigrate: true` creates the `media` table on first use.
  database: {
    provider: 'postgres',                      // 'sqlite' | 'postgres' | 'mysql' | 'mongodb'
    connection: { url: process.env.DATABASE_URL! },
    autoMigrate: true,
  },

  storage: {
    default: 'local',
    disks: {
      local: LocalStorage({
        root: './storage/media',
        publicUrlBase: '/media',
      }),
    },
  },

  image: sharpProcessor(),

  owners: {
    User: ({ collection }) => {
      collection('avatars')
        .singleFile()
        .accepts('image/*')
        .maxSize('5MB')
        .convert('thumb',   (i) => i.width(96).height(96).fit('cover').format('webp'))
        // Heavy variant in the queue; low priority so interactive jobs run first.
        .convert('preview', (i) => i.width(1920).format('webp'), { queued: true, priority: 10 })
    },
  },
})
```

**3. Apply the schema** — either set `autoMigrate: true` (above) or run once explicitly:

```bash
npx mediable migrate
```

**4. Use it in any route** — it's just functions.

```ts
import express from 'express'
import multer from 'multer'
import { media } from './media'

const app = express()
const upload = multer({ storage: multer.memoryStorage() })

app.post('/users/:id/avatar', upload.single('file'), async (req, res) => {
  const record = await media.addMedia({
    model: { type: 'User', id: req.params.id },
    file: req.file,                             // multer's File — passed through as-is
    collection: 'avatars',
  })
  res.status(201).json(record)
})

app.get('/users/:id/avatar', async (req, res) => {
  const record = await media.getFirst({ type: 'User', id: req.params.id }, 'avatars')
  if (!record) return res.status(404).end()
  // If `preview` is still processing, url() falls back to the original automatically.
  res.json({
    record,
    thumbUrl: await media.url(record, 'thumb'),
    previewUrl: await media.url(record, 'preview'),
  })
})

app.delete('/media/:id', async (req, res) => {
  // your auth check here
  await media.delete(req.params.id)
  res.status(204).end()
})

app.listen(3000)
```

That's the whole surface.

---

## Core concepts

**Owner.** The parent entity a media record belongs to — identified by `(modelType, modelId)`. Any string / id pair works; no ORM coupling. `('User', '42')`, `('Product', 1)`, `('Post', 'abc123')` are all valid.

**Collection.** A named grouping of media on an owner type: `avatars`, `documents`, `gallery`. Each collection defines its own validation rules (mime, size, count), target disk, and a list of conversions.

**Conversion.** A named derived variant (`thumb`, `preview`, `card`) generated from the source file. Colocated inside a collection, or declared at the owner root and applied to multiple collections via `performOn(...)`. Runs inline during upload by default, or in the queue when marked `.queued()`.

**Storage driver.** A pluggable filesystem abstraction. `LocalStorage` ships in core; S3-compatible, GCS, and Azure drivers come in their own packages.

**Database adapter.** A pluggable persistence layer for the `media` table. Four built-in providers ship today: SQLite, PostgreSQL, MySQL, MongoDB — just pick a `provider` and give a connection. Prisma / Drizzle / custom adapters are supported as a bring-your-own escape hatch.

**Headless.** The library exposes only functions. Your framework owns routing, body parsing, and authorization. You call `media.addMedia(...)` inside your route and return the result however your app returns things.

---

## Configuration

```ts
interface MediableConfig {
  secret: string                                    // min 16 chars; used for HMAC signing
  database: DatabaseAdapter | BuiltInDatabaseConfig
  storage: {
    default: string
    disks: Record<string, StorageDriver>
  }
  image?: ImageProcessor                            // required only if inline conversions are used
  queue?: Queue                                     // defaults to in-process queue
  pathGenerator?: PathGenerator
  owners?: Record<string, OwnerCallback>
  events?: MediaEventHandlers
  logger?: Logger
}
```

### Owners, collections, and conversions

The `owners` map has one entry per `modelType`. Each value is a **builder callback** that receives `{ collection, convert }`:

```ts
owners: {
  User: ({ collection, convert }) => {
    // colocated conversions
    collection('avatars')
      .singleFile()                                    // replaces existing on re-attach
      .accepts('image/*')
      .maxSize('5MB')
      .convert('thumb',   (i) => i.width(96).height(96).fit('cover').format('webp'))
      // Run in the queue, low priority
      .convert('preview', (i) => i.width(1920).format('webp'), { queued: true, priority: 10 })

    collection('documents')
      .accepts('application/pdf', 'application/msword')
      .maxFiles(20)
      .disk('s3')
      .fallbackUrl('/images/placeholder-doc.svg')

    // shared conversion — applied to multiple collections via performOn(...)
    convert('card', (i) => i.width(640).fit('inside').format('webp'))
      .performOn('avatars', 'documents')
      .queued()
      .priority(1)                                     // high priority — runs before other queued jobs
  },

  // Catch-all — used for owners not registered by name
  '*': ({ convert }) => {
    convert('thumb', (i) => i.width(128).height(128).fit('cover').format('webp'))
  },
}
```

**CollectionBuilder methods**

| Method | Effect |
|---|---|
| `.singleFile()` | Only one media allowed; re-attaching replaces the previous one |
| `.accepts(...)` | Mime types (`'image/png'`), wildcards (`'image/*'`), or extensions (`'.pdf'`) |
| `.maxSize(spec)` | `'5MB'`, `'500KB'`, `'1GB'`, or raw byte number |
| `.maxFiles(n)` | Max media in this collection per owner |
| `.disk(name)` | Override default disk for originals |
| `.conversionsDisk(name)` | Store conversions on a different disk |
| `.fallbackUrl(url)` | URL returned when no media exists in the collection |
| `.preservingOriginal()` | For `addFromFile`, don't delete the source file |
| `.convert(name, fn, opts?)` | Colocated conversion. `opts`: `{ queued?: boolean; priority?: number }` |

**SharedConversionBuilder methods** (returned by top-level `convert()`)

| Method | Effect |
|---|---|
| `.performOn(...names)` | Restrict the shared conversion to these collections. Omit to apply to every image-type collection on this owner |
| `.queued()` | Run in the queue instead of inline |
| `.priority(n)` | Job priority when queued. Lower number = higher priority (BullMQ convention). `1` = urgent, `10` = background |

**ImageBuilder DSL** — available inside every `convert((i) => …)`:

```ts
i.width(640)
 .height(480)
 .fit('cover' | 'contain' | 'fill' | 'inside' | 'outside')
 .format('webp' | 'jpeg' | 'png' | 'avif', { quality: 80, progressive: true })
 .quality(80)
 .blur(5)
 .sharpen()
 .grayscale()
 .rotate(90)
 .flip()
 .flop()
 .crop(x, y, w, h)
```

### Database

Pick a database type and provide a connection — that's the whole API for 95% of users. The library picks a good default driver (Kysely for SQL, Mongoose for MongoDB) and lazy-requires it on first use.

```ts
// SQLite — zero config, great for dev
database: {
  provider: 'sqlite',
  connection: { filename: './storage/media.db' },
  autoMigrate: true,
}

// PostgreSQL
database: {
  provider: 'postgres',
  connection: { url: process.env.DATABASE_URL! },
  autoMigrate: true,
}

// MySQL / MariaDB
database: {
  provider: 'mysql',
  connection: { url: process.env.DATABASE_URL! },
  autoMigrate: true,
}

// MongoDB
database: {
  provider: 'mongodb',
  connection: { url: process.env.MONGO_URL! },
}
```

**That's it.** No adapter to write, no Kysely/Mongoose setup. Just pick a type and point it at your DB.

#### Applying the schema

Two equivalent ways:

1. **`autoMigrate: true`** (shown above) — the library creates the `media` table + indexes on first query. Fine for dev and small-team deploys.
2. **Explicit migrate step** — run once before the app starts:

   ```bash
   npx mediable migrate
   ```

   Reads your config, connects, creates the schema. Idempotent.

#### When `autoMigrate` isn't enough

`autoMigrate` runs `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` — that's it. If a future library version adds a column, `autoMigrate` won't patch existing tables. For production, run real migrations:

- **Postgres / MySQL** — the CLI also writes `migrations/0001_create_media.sql`. Feed that (and any future library-emitted migrations) into your migration tool of choice (Flyway, `drizzle-kit`, plain `psql`, …).
- **MongoDB** — the `migrate` command calls `MediaModel.createIndexes()`. Re-run after library upgrades to pick up new indexes.

#### Advanced: bring-your-own adapter (Prisma, Drizzle, custom)

If you already have a Prisma or Drizzle setup you want to reuse, the `database` field also accepts any `DatabaseAdapter` — skip the built-in providers entirely:

```ts
// Prisma
import { prismaAdapter } from './prisma-media-adapter'    // your own adapter
database: prismaAdapter(prisma),

// Drizzle
import { drizzleAdapter } from './drizzle-media-adapter'
database: drizzleAdapter(db),
```

You own the schema (Prisma model / Drizzle table / hand-written migration) and the adapter — a short file that implements the five `DatabaseAdapter` methods (`create`, `findOne`, `findMany`, `update`, `delete`). The `MediaRecord` shape in [Type reference](#type-reference) is all you need to map.

This path is useful when:
- You already run Prisma/Drizzle migrations in your app and don't want a second migration tool
- You want `jsonb` columns on Postgres (the built-in uses `text` for portability)
- You're using something exotic (DynamoDB, Firestore, an RPC service)

For new projects, prefer the built-in providers above — you'll write less code.

### Storage

```ts
import { LocalStorage } from 'mediable'

storage: {
  default: 'local',
  disks: {
    local: LocalStorage({
      root: './storage/media',
      publicUrlBase: '/media',              // optional: URL prefix if a static middleware serves `root`
      signingSecret: 'optional',            // defaults to config.secret
    }),
  },
}
```

Write your own driver by implementing `StorageDriver` (see the [type reference](#type-reference)).

### Image processor

```ts
import { sharpProcessor } from 'mediable/sharp'

image: sharpProcessor({
  failOn: 'none',                         // 'none' | 'truncated' | 'error' | 'warning'
  limitInputPixels: 268_402_689,          // decode-bomb guard
}),
```

### Queue

Defaults to an in-process async queue — fine for dev and single-process setups. Jobs don't persist across restarts.

For production, swap in the **BullMQ** adapter (Redis-backed, durable, horizontally scalable):

```ts
import { bullmqQueue } from 'mediable/bullmq'
```

**Redis connection — flexible input.** Pass a connection object, a URL string, or an existing `IORedis` instance:

```ts
// Option 1 — object
queue: bullmqQueue({
  connection: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD,
    db: 0,
    tls: process.env.REDIS_TLS === '1' ? {} : undefined,
    family: 6,                            // IPv6 if your host needs it
  },
  concurrency: 4,
})

// Option 2 — URL string (redis:// or rediss:// for TLS)
queue: bullmqQueue({
  connection: process.env.REDIS_URL!,     // e.g. 'rediss://:password@my-host:6380/0'
  concurrency: 4,
})

// Option 3 — reuse an existing IORedis instance (full control, custom retry / sentinel / cluster)
import Redis from 'ioredis'
const redis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,             // required for BullMQ workers
  enableReadyCheck: false,
})

queue: bullmqQueue({ connection: redis, concurrency: 4 })
```

**Full option surface:**

```ts
bullmqQueue({
  connection,                              // object | string | IORedis | Cluster (required)
  queueName: 'media',                      // default: 'mediable'
  concurrency: 4,                          // worker parallelism (default: 1)

  // Don't start a worker here — this is a web-server process.
  // Run a separate worker process with the same config (producerOnly: false) to drain the queue.
  producerOnly: true,

  // Job defaults merged into every enqueue.
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail: 100,
    priority: 0,                           // static default priority applied to every job
  },

  // Advanced worker tuning — passed straight to BullMQ `Worker`.
  workerOptions: {
    lockDuration: 30_000,
    stalledInterval: 30_000,
    maxStalledCount: 1,
    limiter: { max: 100, duration: 60_000 },
  },
})
```

**Typical two-process deployment:**

```ts
// web.ts — handles HTTP
export const media = mediable({
  /* … */
  queue: bullmqQueue({ connection: process.env.REDIS_URL!, producerOnly: true }),
})

// worker.ts — dedicated worker process
export const media = mediable({
  /* … same config as web, but … */
  queue: bullmqQueue({ connection: process.env.REDIS_URL!, concurrency: 4 }),
})
```

**Priority.** Lower number = higher priority. `0` or omitted = no priority (FIFO). Configurable at three levels:

```ts
// Per-conversion (definition time)
collection('avatars').convert('preview', (i) => i.width(1920), { queued: true, priority: 10 })
convert('card', (i) => i.width(640)).performOn('gallery').queued().priority(1)

// Per-enqueue (at the call site)
await media.$context.config.queue.enqueue('my-job', payload, { priority: 1 })

// Queue-wide default
bullmqQueue({ connection, defaultJobOptions: { priority: 5 } })
```

Bring your own queue with the `Queue` interface:

```ts
interface Queue {
  enqueue<T>(job: string, payload: T, opts?: { delay?: number; attempts?: number; priority?: number }): Promise<void>
  process<T>(job: string, handler: (payload: T) => Promise<void>): void
  close(): Promise<void>
}
```

### Events

```ts
events: {
  onMediaAdded:          async ({ media }) => { /* … */ },
  onMediaSaving:         async ({ media }) => { /* … */ },
  onMediaDeleting:       async ({ media }) => { /* … */ },
  onMediaDeleted:        async ({ media }) => { /* … */ },
  onConversionsFinished: async ({ media }) => { /* … */ },
}
```

Handlers run after the DB write. Errors are swallowed to avoid breaking the caller — log from inside your handler if you need visibility.

---

## API reference

```ts
// ---- Attach (one-liner, accepts most file shapes) ----
await media.addMedia({
  model: { type: 'User', id: userId },
  file: req.file,                     // see "What `file` accepts" below
  fileName?: 'image.jpg',              // required if `file` is a raw Buffer / stream
  collection?: 'avatars',
  name?: 'Profile photo',
  customProperties?: { alt: 'me' },
  order?: 3,
  disk?: 's3',
  preservingOriginal?: false,
})

// ---- Attach (fluent chain) ----
await media.for('User', userId)
  .addFromFile('/tmp/image.jpg')       // or addFromBuffer | addFromStream | addFromUrl | addFromBase64
  .toCollection('avatars')
  .withName('Profile photo')
  .withFileName('image.jpg')
  .withCustomProperties({ alt: 'me' })
  .withOrder(0)
  .preservingOriginal()
  .usingDisk('s3')
  .save()

// ---- Retrieval ----
await media.get(mediaId)                                    // MediaRecord | null
await media.getByUuid(uuid)                                  // MediaRecord | null
await media.getFirst({ type: 'User', id: 42 }, 'avatars')    // first record in collection
await media.list({ type: 'User', id: 42 }, 'gallery')        // ordered by orderColumn

// ---- URLs ----
await media.url(record, 'thumb')                                     // public URL or null
await media.url(record, 'thumb', { fallback: false })                // see "Conversion fallback"
await media.temporaryUrl(record, 300, 'thumb')                       // signed URL, 5 min expiry

// ---- Byte access (stream into your own response) ----
const { body, contentType, contentLength } = await media.stream(record, 'thumb', {
  range: { start: 0, end: 1023 },
  fallback: true,                                                     // default
})
body.pipe(res)                                                         // Node Readable

// ---- Signed token verification (for a private-serve route) ----
const verified = await media.verifySignedToken(token)                  // { media, key } | null

// ---- Mutations ----
await media.delete(mediaId)                                            // deletes record + files + conversions
await media.reorder([uuid1, uuid2, uuid3])
await media.updateCustomProperties(mediaId, { alt: 'new' })
await media.regenerateConversions(mediaId)
```

### What `file` accepts

`media.addMedia({ file, … })` works with whatever your framework hands you:

| Shape | Example |
|---|---|
| Multer's `Express.Multer.File` | `file: req.file` (has `{ buffer, originalname, mimetype }`) |
| Fastify-multipart file | `file: { stream, filename, mimetype }` |
| Web `File` (Fetch / Hono) | `file: formData.get('file')` |
| Raw `Buffer` / `Uint8Array` | `file: buf, fileName: 'image.jpg'` |
| Node `Readable` stream | `file: stream, fileName: 'image.jpg'` |
| Local filesystem path | `file: { path: '/tmp/image.jpg' }` |
| Base64-encoded data | `file: { data: '…', filename: 'image.jpg', encoding: 'base64' }` |
| Remote URL | `file: { url: 'https://…', maxBytes: 10_000_000 }` |

### Conversion fallback

When you ask for a conversion that hasn't been generated yet (e.g. queued and not yet processed, or never configured), `url()` / `temporaryUrl()` / `stream()` fall back to the **original** file by default. That way your app never serves a broken image while a background worker is still churning.

```ts
// Fallback ON (default) — returns the original if `preview` isn't ready yet
const url = await media.url(record, 'preview')

// Opt out — returns the conversion path/URL even if the file doesn't exist
const strict = await media.url(record, 'preview', { fallback: false })

// Same for stream()
const { body, contentType } = await media.stream(record, 'preview')              // falls back
await media.stream(record, 'preview', { fallback: false })                        // throws ENOENT
```

Check `record.generatedConversions['preview']` before rendering a conversion-specific `<img srcset>` if you care whether the fallback kicked in.

---

## Recipes

### Upload from Express + multer

```ts
import multer from 'multer'
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

app.post('/users/:id/avatar', upload.single('file'), async (req, res) => {
  const record = await media.addMedia({
    model: { type: 'User', id: req.params.id },
    file: req.file,
    collection: 'avatars',
  })
  res.status(201).json(record)
})
```

### Upload from Fastify

```ts
import fastifyMultipart from '@fastify/multipart'
await app.register(fastifyMultipart)

app.post('/users/:id/avatar', async (req, reply) => {
  const data = await req.file()
  if (!data) return reply.code(400).send({ error: 'file required' })
  const record = await media.addMedia({
    model: { type: 'User', id: (req.params as { id: string }).id },
    file: { stream: data.file, filename: data.filename, mimetype: data.mimetype },
    collection: 'avatars',
  })
  reply.code(201).send(record)
})
```

### Upload from Hono

```ts
app.post('/users/:id/avatar', async (c) => {
  const form = await c.req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return c.json({ error: 'file required' }, 400)
  const record = await media.addMedia({
    model: { type: 'User', id: c.req.param('id') },
    file,                                          // Web File — supported natively
    collection: 'avatars',
  })
  return c.json(record, 201)
})
```

### Upload from Next.js App Router

```ts
// app/api/users/[id]/avatar/route.ts
import { media } from '@/lib/media'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return Response.json({ error: 'file required' }, { status: 400 })
  const record = await media.addMedia({
    model: { type: 'User', id: params.id },
    file,
    collection: 'avatars',
  })
  return Response.json(record, { status: 201 })
}

export const runtime = 'nodejs'
```

### Upload from NestJS

```ts
import { Controller, Post, Param, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { media } from './media'

@Controller('users/:id/avatar')
export class AvatarController {
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return media.addMedia({
      model: { type: 'User', id },
      file,
      collection: 'avatars',
    })
  }
}
```

### Private stream-through-app

When the storage driver has no public URL (`url()` returns `null`), stream bytes through your own route so your auth runs on every access:

```ts
app.get('/media/:id/file', requireAuth, async (req, res) => {
  const record = await media.get(req.params.id)
  if (!record) return res.status(404).end()
  if (!canView(req.user, record)) return res.status(403).end()

  const { body, contentType, contentLength } = await media.stream(record)
  res.setHeader('content-type', contentType)
  if (contentLength) res.setHeader('content-length', String(contentLength))
  body.pipe(res)
})
```

Or use signed tokens for time-limited sharing:

```ts
// Issue
const url = await media.temporaryUrl(record, 300)        // 5 min
// url looks like: "/api/media/signed/eyJrIjoi..."

// Redeem (your own route, anywhere you want)
app.get('/api/media/signed/:token', async (req, res) => {
  const verified = await media.verifySignedToken(req.params.token)
  if (!verified) return res.status(403).end()
  const { body, contentType } = await media.stream(verified.media)
  res.setHeader('content-type', contentType)
  body.pipe(res)
})
```

### Authorization

Authorize inline in your own routes — the library doesn't re-authenticate. Use whatever session / permission system you already have.

```ts
app.delete('/media/:id', async (req, res) => {
  const record = await media.get(req.params.id)
  if (!record) return res.status(404).end()
  const user = await getUser(req)
  if (user?.id !== record.modelId) return res.status(403).end()
  await media.delete(record.id)
  res.status(204).end()
})
```

With better-auth specifically:

```ts
import { auth } from './auth'

app.post('/users/:id/avatar', upload.single('file'), async (req, res) => {
  const session = await auth.api.getSession({ headers: req.headers as any })
  if (!session) return res.status(401).end()
  if (session.user.id !== req.params.id) return res.status(403).end()

  const record = await media.addMedia({
    model: { type: 'User', id: req.params.id },
    file: req.file,
    collection: 'avatars',
  })
  res.status(201).json(record)
})
```

---

## Database schema

The built-in SQL providers (`sqlite` / `postgres` / `mysql`) create this table on first run when `autoMigrate: true`. Also emitted as `migrations/0001_create_media.sql` by `npx mediable init` for teams that prefer to apply migrations through their own tooling. MongoDB users get the analogous indexes created by `npx mediable migrate`.

```sql
CREATE TABLE media (
  id                    TEXT PRIMARY KEY,
  uuid                  TEXT NOT NULL UNIQUE,
  model_type            TEXT NOT NULL,
  model_id              TEXT NOT NULL,
  collection_name       TEXT NOT NULL DEFAULT 'default',
  name                  TEXT NOT NULL,
  file_name             TEXT NOT NULL,
  mime_type             TEXT NOT NULL,
  disk                  TEXT NOT NULL,
  conversions_disk      TEXT NOT NULL,
  size                  INTEGER NOT NULL DEFAULT 0,
  manipulations         TEXT NOT NULL DEFAULT '{}',
  custom_properties     TEXT NOT NULL DEFAULT '{}',
  generated_conversions TEXT NOT NULL DEFAULT '{}',
  responsive_images     TEXT NOT NULL DEFAULT '{}',
  order_column          INTEGER NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'ready',
  optimized_at          TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX media_owner_idx             ON media(model_type, model_id);
CREATE INDEX media_owner_collection_idx  ON media(model_type, model_id, collection_name);
CREATE INDEX media_status_created_idx    ON media(status, created_at);
```

---

## Type reference

```ts
interface MediaRecord {
  id: string
  uuid: string                                  // public opaque id you expose to clients
  modelType: string
  modelId: string
  collectionName: string
  name: string                                  // display name, editable
  fileName: string                              // sanitized filename on disk
  mimeType: string
  disk: string
  conversionsDisk: string
  size: number                                  // bytes
  manipulations: Json                           // reserved for per-conversion overrides
  customProperties: Json                        // arbitrary per-file metadata
  generatedConversions: Record<string, boolean> // { thumb: true, preview: false }
  responsiveImages: Json                        // populated by responsive-images plugin (M4)
  orderColumn: number
  status: 'pending' | 'ready' | 'failed'
  optimizedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
```

---

## Security

- **Path traversal** — filenames are sanitized and every storage key is re-checked before I/O. Drivers reject `..`, absolute paths, and backslashes.
- **Mime spoofing** — every upload passes through `file-type` byte-sniffing. Sniffed type wins over any client-supplied `Content-Type`.
- **Size limits** — enforced at the collection level (`maxSize`), streamed on upload so oversized inputs reject mid-flight.
- **Decode bombs** — Sharp is initialized with `limitInputPixels` (configurable) so a crafted tiny file can't blow up memory during decode.
- **Signed URLs** — HMAC-SHA-256 over `path + expires`, timing-safe comparison on verification. Tampered or expired tokens return `null` from `media.verifySignedToken(...)`.
- **Authorization is your job.** The library doesn't touch your HTTP layer — put your auth in your route before calling `media.*`.

---

## Roadmap

| Milestone | Scope |
|---|---|
| **M1 (shipped, v0.1.0)** | headless core, `owners`/`collection`/`convert` builders with `{ queued, priority }` options, `addMedia` one-liner, conversion fallback, LocalStorage, **four built-in DB providers** (SQLite, Postgres, MySQL, MongoDB), Sharp, BullMQ (URL/object/IORedis input, `producerOnly`, worker tuning), `npx mediable init` + `npx mediable migrate` CLI, Express + multer example, 24/24 tests (20 in-memory + 4 live Postgres) |
| **M2** | S3-compatible storage driver (AWS / R2 / MinIO), presigned direct-to-storage uploads, orphan reaper, S3 SigV4 signed URLs |
| **M3** | Responsive-images plugin (srcset + SVG / blurhash placeholders), browser client SDK with upload progress + cancellation |
| **M4** | Docs site, migration guide from multer + custom storage, security audit |
| **v1.0** | API freeze + SemVer guarantee |

---

## License

MIT
