# Better-media

Headless, framework-agnostic media library for Node.js.

Attach files (images, docs, video) to any model (`User`, `Product`, `Post`, …) with named collections, image conversions, pluggable storage drivers (local FS, S3-compatible, …) and pluggable databases (Kysely, Prisma, Drizzle, …).

**Headless by design.** No router, no handler, no framework adapters. You already have routes, auth middleware, and a multipart parser in your app — `better-media` just gives you the functions: `media.addMedia(...)`, `media.get(...)`, `media.url(...)`, `media.stream(...)`, `media.delete(...)`. Call them from your own Express / Hono / Fastify / NestJS / Next.js / Bun / Deno route — no wiring.

> **Status:** M1 shipped. Core + local storage + Kysely/SQLite + Sharp + BullMQ + Express example. 20/20 tests pass, covering the real Sharp pipeline via a JPEG fixture. S3, Prisma/Drizzle adapters, responsive images, and the client SDK land in later milestones.

---

## Table of contents

- [Install](#install)
- [Quick start](#quick-start)
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
pnpm add better-media
```

One install. Sharp, better-sqlite3, and BullMQ are bundled as dependencies and loaded lazily — you only pay runtime cost for what you actually import.

| Import | What loads |
|---|---|
| `import { betterMedia, LocalStorage } from 'better-media'` | Core only |
| `import { sharpProcessor } from 'better-media/sharp'` | Sharp native bindings — only if you opt in |
| `import { bullmqQueue } from 'better-media/bullmq'` | BullMQ + ioredis — only if you opt in |

TypeScript-first. Publishes ESM + CJS. Requires Node 20+. Install size is ~100MB because of Sharp and BullMQ — if that's a dealbreaker, open an issue.

---

## Quick start

**1. Create a config file** — one source of truth for your app.

```ts
// src/media.ts
import { betterMedia, LocalStorage } from 'better-media'
import { sharpProcessor } from 'better-media/sharp'

export const media = betterMedia({
  secret: process.env.MEDIA_SECRET!,           // required, min 16 chars

  database: {
    provider: 'sqlite',
    connection: { filename: './storage/media.db' },
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

**2. Use it in any route** — it's just functions.

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

**Database adapter.** A pluggable persistence layer for the `media` table. Built-in Kysely adapter works with SQLite today; Prisma and Drizzle ship later.

**Headless.** The library exposes only functions. Your framework owns routing, body parsing, and authorization. You call `media.addMedia(...)` inside your route and return the result however your app returns things.

---

## Configuration

```ts
interface BetterMediaConfig {
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

The `database` field accepts either a **built-in config** (zero-boilerplate SQLite) or any object implementing the `DatabaseAdapter` interface. Everything else — Postgres, MySQL, Turso, Prisma, Drizzle — is one of those two paths.

#### 1. Built-in SQLite (fastest path, dev + single-server prod)

```ts
database: {
  provider: 'sqlite',
  connection: { filename: './storage/media.db' },  // or `:memory:` for tests
  autoMigrate: true,                                // creates the `media` table on first run
}
```

No migrations, no ORM setup, just works. Ships with `better-sqlite3`.

#### 2. Kysely with any dialect (Postgres, MySQL, Turso, D1, …)

Build your own `Kysely` instance and pass it through `kyselyAdapter()`. Works for any SQL dialect Kysely supports.

##### PostgreSQL

```bash
pnpm add pg
pnpm add -D @types/pg
```

```ts
import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import { betterMedia, kyselyAdapter, type KyselyDatabaseSchema } from 'better-media'

const db = new Kysely<KyselyDatabaseSchema>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: process.env.DATABASE_URL, max: 10 }),
  }),
})

export const media = betterMedia({
  secret: process.env.MEDIA_SECRET!,
  database: kyselyAdapter(db, { autoMigrate: true }),
  storage: { /* … */ },
})
```

##### MySQL / MariaDB

```bash
pnpm add mysql2
```

```ts
import { Kysely, MysqlDialect } from 'kysely'
import { createPool } from 'mysql2'
import { kyselyAdapter, type KyselyDatabaseSchema } from 'better-media'

const db = new Kysely<KyselyDatabaseSchema>({
  dialect: new MysqlDialect({
    pool: createPool({ uri: process.env.DATABASE_URL, connectionLimit: 10 }),
  }),
})

// MySQL < 8.0 can't have default values on TEXT columns — if autoMigrate errors,
// run the SQL from the "Database schema" section below manually.
database: kyselyAdapter(db, { autoMigrate: true }),
```

##### SQLite (own Kysely instance)

Use this when you already own a Kysely instance in your app and want to share it.

```bash
pnpm add better-sqlite3
```

```ts
import Database from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import { kyselyAdapter, type KyselyDatabaseSchema } from 'better-media'

const db = new Kysely<KyselyDatabaseSchema>({
  dialect: new SqliteDialect({ database: new Database('./app.db') }),
})

database: kyselyAdapter(db, { autoMigrate: true }),
```

##### Turso / LibSQL (serverless SQLite)

```bash
pnpm add @libsql/client @libsql/kysely-libsql
```

```ts
import { Kysely } from 'kysely'
import { LibsqlDialect } from '@libsql/kysely-libsql'
import { kyselyAdapter, type KyselyDatabaseSchema } from 'better-media'

const db = new Kysely<KyselyDatabaseSchema>({
  dialect: new LibsqlDialect({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  }),
})

database: kyselyAdapter(db, { autoMigrate: true }),
```

##### Cloudflare D1

```ts
import { Kysely } from 'kysely'
import { D1Dialect } from 'kysely-d1'
import { kyselyAdapter, type KyselyDatabaseSchema } from 'better-media'

// In a Workers/Pages request context where `env.DB` is a D1Database binding:
const db = new Kysely<KyselyDatabaseSchema>({
  dialect: new D1Dialect({ database: env.DB }),
})

database: kyselyAdapter(db),   // autoMigrate not supported on D1 — use D1 migrations
```

##### Sharing Kysely with your app schema

If your app already has a typed Kysely, merge the `media` table into your schema so both sides stay strongly typed:

```ts
import type { KyselyDatabaseSchema } from 'better-media'

interface AppDB {
  users: UserTable
  posts: PostTable
  media: KyselyDatabaseSchema['media']   // ← merge the media table
}

const db = new Kysely<AppDB>({ /* … */ })
database: kyselyAdapter(db, { autoMigrate: true }),
```

#### 3. Custom `DatabaseAdapter` (Prisma, Drizzle, Mongoose, …)

For ORMs that don't wrap Kysely, implement the `DatabaseAdapter` interface yourself. Official `@better-media/prisma` and `@better-media/drizzle` packages land in M3 — until then, here's a compact sketch.

##### Prisma

Add this model to your `schema.prisma`:

```prisma
model Media {
  id                    String   @id
  uuid                  String   @unique
  modelType             String   @map("model_type")
  modelId               String   @map("model_id")
  collectionName        String   @default("default") @map("collection_name")
  name                  String
  fileName              String   @map("file_name")
  mimeType              String   @map("mime_type")
  disk                  String
  conversionsDisk       String   @map("conversions_disk")
  size                  Int
  manipulations         Json     @default("{}")
  customProperties      Json     @default("{}")   @map("custom_properties")
  generatedConversions  Json     @default("{}")   @map("generated_conversions")
  responsiveImages      Json     @default("{}")   @map("responsive_images")
  orderColumn           Int      @default(0)      @map("order_column")
  status                String   @default("ready")
  optimizedAt           DateTime?                 @map("optimized_at")
  createdAt             DateTime @default(now())  @map("created_at")
  updatedAt             DateTime @updatedAt       @map("updated_at")

  @@index([modelType, modelId])
  @@index([modelType, modelId, collectionName])
  @@index([status, createdAt])
  @@map("media")
}
```

Then wire up a minimal adapter:

```ts
import type { DatabaseAdapter, MediaRecord } from 'better-media'
import type { PrismaClient } from '@prisma/client'

export function prismaAdapter(prisma: PrismaClient): DatabaseAdapter {
  const toRecord = (row: any): MediaRecord => ({
    ...row,
    modelId: String(row.modelId),
    optimizedAt: row.optimizedAt ?? null,
  })
  return {
    id: 'prisma',
    async create(_m, data) {
      return toRecord(await prisma.media.create({ data: { ...data, modelId: String(data.modelId) } }))
    },
    async findOne(_m, where) {
      const row = await prisma.media.findFirst({ where: where as any })
      return row ? toRecord(row) : null
    },
    async findMany(_m, { where, orderBy, limit, offset }) {
      const rows = await prisma.media.findMany({
        where: where as any,
        orderBy: orderBy?.map((o) => ({ [o.field]: o.dir })),
        take: limit,
        skip: offset,
      })
      return rows.map(toRecord)
    },
    async update(_m, where, data) {
      const first = await prisma.media.findFirst({ where: where as any })
      if (!first) throw new Error('not found')
      return toRecord(await prisma.media.update({ where: { id: first.id }, data: data as any }))
    },
    async delete(_m, where) {
      await prisma.media.deleteMany({ where: where as any })
    },
    transaction: (fn) => prisma.$transaction((tx) => fn(prismaAdapter(tx as PrismaClient))),
  }
}

// Usage
database: prismaAdapter(prisma),
```

##### Drizzle

Define the table in your schema:

```ts
// db/schema/media.ts
import { pgTable, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core'

export const media = pgTable(
  'media',
  {
    id: text('id').primaryKey(),
    uuid: text('uuid').notNull().unique(),
    modelType: text('model_type').notNull(),
    modelId: text('model_id').notNull(),
    collectionName: text('collection_name').notNull().default('default'),
    name: text('name').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    disk: text('disk').notNull(),
    conversionsDisk: text('conversions_disk').notNull(),
    size: integer('size').notNull().default(0),
    manipulations: jsonb('manipulations').notNull().default({}),
    customProperties: jsonb('custom_properties').notNull().default({}),
    generatedConversions: jsonb('generated_conversions').notNull().default({}),
    responsiveImages: jsonb('responsive_images').notNull().default({}),
    orderColumn: integer('order_column').notNull().default(0),
    status: text('status').notNull().default('ready'),
    optimizedAt: timestamp('optimized_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index('media_owner_idx').on(t.modelType, t.modelId),
    ownerCollectionIdx: index('media_owner_collection_idx').on(t.modelType, t.modelId, t.collectionName),
    statusCreatedIdx: index('media_status_created_idx').on(t.status, t.createdAt),
  }),
)
```

Adapter (sketch):

```ts
import { and, eq, asc, desc } from 'drizzle-orm'
import type { DatabaseAdapter } from 'better-media'
import { media as mediaTable } from './db/schema/media'

export function drizzleAdapter(db: YourDrizzleDB): DatabaseAdapter {
  const whereClause = (where: any) =>
    and(...Object.entries(where).map(([k, v]) => eq((mediaTable as any)[k], v as any)))

  return {
    id: 'drizzle',
    async create(_m, data) {
      const [row] = await db.insert(mediaTable).values(data as any).returning()
      return row as any
    },
    async findOne(_m, where) {
      const [row] = await db.select().from(mediaTable).where(whereClause(where)).limit(1)
      return (row as any) ?? null
    },
    async findMany(_m, q) {
      let query = db.select().from(mediaTable) as any
      if (q.where) query = query.where(whereClause(q.where))
      if (q.orderBy) {
        for (const o of q.orderBy) {
          query = query.orderBy(o.dir === 'asc' ? asc((mediaTable as any)[o.field]) : desc((mediaTable as any)[o.field]))
        }
      }
      if (q.limit) query = query.limit(q.limit)
      if (q.offset) query = query.offset(q.offset)
      return query
    },
    async update(_m, where, data) {
      const [row] = await db.update(mediaTable).set(data as any).where(whereClause(where)).returning()
      return row as any
    },
    async delete(_m, where) {
      await db.delete(mediaTable).where(whereClause(where))
    },
  }
}

// Usage
database: drizzleAdapter(db),
```

##### MongoDB / any non-SQL store

The library's schema is relational (polymorphic FKs + JSON columns), but nothing requires SQL — you can implement `DatabaseAdapter` against Mongoose, DynamoDB, Firestore, or plain Redis if that's what you've got. Just map `MediaRecord` fields to documents, index `(modelType, modelId)` and `(modelType, modelId, collectionName)`, and return the same shape. Native `@better-media/mongo` is not on the short-term roadmap — community adapters welcome.

#### Choosing `autoMigrate`

| Setting | When |
|---|---|
| `autoMigrate: true` | Development, tests, SQLite single-binary deploys |
| `autoMigrate: false` (default for adapters) | Production with team migrations (Prisma Migrate, Drizzle Kit, Kysely migrations, Flyway, etc.) — run the [schema SQL](#database-schema) yourself |

MySQL < 8.0 can reject `DEFAULT '{}'` on `TEXT` columns — if autoMigrate errors there, fall back to manual migration using the SQL in the [Database schema](#database-schema) section.

### Storage

```ts
import { LocalStorage } from 'better-media'

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
import { sharpProcessor } from 'better-media/sharp'

image: sharpProcessor({
  failOn: 'none',                         // 'none' | 'truncated' | 'error' | 'warning'
  limitInputPixels: 268_402_689,          // decode-bomb guard
}),
```

### Queue

Defaults to an in-process async queue — fine for dev and single-process setups. Jobs don't persist across restarts.

For production, swap in the **BullMQ** adapter (Redis-backed, durable, horizontally scalable):

```ts
import { bullmqQueue } from 'better-media/bullmq'
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
  queueName: 'media',                      // default: 'better-media'
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
export const media = betterMedia({
  /* … */
  queue: bullmqQueue({ connection: process.env.REDIS_URL!, producerOnly: true }),
})

// worker.ts — dedicated worker process
export const media = betterMedia({
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

The built-in Kysely adapter with `autoMigrate: true` creates this table on first run. For Prisma/Drizzle (shipping in M3), copy the equivalent schema manually until the CLI emits it.

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
| **M1 (shipped)** | headless core, `owners`/`collection`/`convert` builders with `{ queued, priority }` options, `addMedia` one-liner, conversion fallback, LocalStorage, Kysely/SQLite, Sharp, BullMQ (URL/object/IORedis input, `producerOnly`, worker tuning), Express + multer example, 20/20 tests |
| **M2** | `@better-media/s3` driver, optional presigned-upload helper, orphan reaper, S3 SigV4 signed URLs |
| **M3** | `@better-media/prisma`, `@better-media/drizzle`, `@better-media/cli` (generate/migrate/doctor) |
| **M4** | `@better-media/responsive-images` plugin, `@better-media/client` browser SDK with upload progress |
| **M5** | Docs site, migration guide from multer + custom storage, security review, 1.0 |

---

## License

MIT
