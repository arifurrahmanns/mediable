import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  mediable,
  kyselyAdapter,
  LocalStorage,
  type MediableInstance,
  type KyselyDatabaseSchema,
} from './index'
import { sharpProcessor } from './sharp'

const POSTGRES_URL =
  process.env.TEST_POSTGRES_URL ??
  'postgresql://postgres:postgres@localhost:5432/mediable'

const SECRET = 'postgres-test-secret-at-least-16-chars'
const FIXTURE_PATH = resolve('tests/fixtures/image.jpg')

let pool: Pool | null = null
let kysely: Kysely<KyselyDatabaseSchema> | null = null
let media: MediableInstance | null = null
let tmpRoot: string
let imageJpg: Buffer
let pgReachable = false

beforeAll(async () => {
  if (!existsSync(FIXTURE_PATH)) {
    mkdirSync(dirname(FIXTURE_PATH), { recursive: true })
    const generated = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 200, g: 80, b: 40 },
      },
    })
      .jpeg({ quality: 85 })
      .toBuffer()
    writeFileSync(FIXTURE_PATH, generated)
  }
  imageJpg = readFileSync(FIXTURE_PATH)

  try {
    pool = new Pool({
      connectionString: POSTGRES_URL,
      connectionTimeoutMillis: 2500,
      max: 4,
    })
    await pool.query('SELECT 1')
    pgReachable = true
  } catch (err) {
    console.warn(
      `[postgres.test] skipping — could not connect to ${POSTGRES_URL} (${(err as Error).message})`,
    )
    pgReachable = false
    if (pool) await pool.end().catch(() => {})
    pool = null
    return
  }

  // Clean slate — drop the table if previous runs left it around.
  await pool.query('DROP TABLE IF EXISTS media')

  kysely = new Kysely<KyselyDatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
  })

  tmpRoot = mkdirSync(`${tmpdir()}/mediable-pg-${Date.now()}`, { recursive: true }) as string

  media = mediable({
    secret: SECRET,
    database: kyselyAdapter(kysely, { autoMigrate: true }),
    storage: {
      default: 'local',
      disks: { local: LocalStorage({ root: `${tmpRoot}/storage` }) },
    },
    image: sharpProcessor(),
    owners: {
      User: ({ collection }) => {
        collection('avatars')
          .singleFile()
          .accepts('image/*')
          .maxSize('5MB')
          .convert('thumb', (i) => i.width(96).height(96).fit('cover').format('webp'))
        collection('gallery').accepts('image/*').maxFiles(10)
      },
    },
  })
})

afterAll(async () => {
  if (kysely) await kysely.destroy().catch(() => {})
  if (pool) await pool.end().catch(() => {})
  if (tmpRoot) {
    const { rmSync } = await import('node:fs')
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})

describe('postgres integration', () => {
  test('autoMigrate creates the media table with expected columns', async () => {
    if (!pgReachable || !pool) return
    // Triggering the adapter runs autoMigrate lazily on first use.
    await media!.list({ type: 'User', id: 'warmup' })

    const cols = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'media' ORDER BY column_name`,
    )
    const columnNames = cols.rows.map((r) => r.column_name).sort()
    expect(columnNames).toEqual(
      [
        'collection_name',
        'conversions_disk',
        'created_at',
        'custom_properties',
        'disk',
        'file_name',
        'generated_conversions',
        'id',
        'manipulations',
        'mime_type',
        'model_id',
        'model_type',
        'name',
        'optimized_at',
        'order_column',
        'responsive_images',
        'size',
        'status',
        'updated_at',
        'uuid',
      ].sort(),
    )

    const indexes = await pool.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'media' ORDER BY indexname`,
    )
    const indexNames = indexes.rows.map((r) => r.indexname)
    expect(indexNames).toContain('media_owner_idx')
    expect(indexNames).toContain('media_owner_collection_idx')
    expect(indexNames).toContain('media_status_created_idx')
  })

  test('addMedia → getFirst → stream thumb → delete roundtrip', async () => {
    if (!pgReachable) return

    const record = await media!.addMedia({
      model: { type: 'User', id: 'pg-u1' },
      file: { buffer: imageJpg, originalname: 'image.jpg', mimetype: 'image/jpeg' },
      collection: 'avatars',
      customProperties: { alt: 'hi from pg' },
    })
    expect(record.mimeType).toBe('image/jpeg')
    expect(record.status).toBe('ready')
    expect(record.generatedConversions).toEqual({ thumb: true })
    expect(record.optimizedAt).not.toBeNull()
    expect(record.customProperties).toEqual({ alt: 'hi from pg' })

    const first = await media!.getFirst({ type: 'User', id: 'pg-u1' }, 'avatars')
    expect(first?.id).toBe(record.id)

    const { body, contentType } = await media!.stream(record, 'thumb')
    expect(contentType).toBe('image/webp')
    const chunks: Buffer[] = []
    for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    expect(Buffer.concat(chunks).length).toBeGreaterThan(0)

    await media!.delete(record.id)
    expect(await media!.get(record.id)).toBeNull()
  })

  test('list is ordered by orderColumn asc', async () => {
    if (!pgReachable) return
    const a = await media!.addMedia({
      model: { type: 'User', id: 'pg-u2' },
      file: { buffer: imageJpg, originalname: 'a.jpg' },
      collection: 'gallery',
    })
    const b = await media!.addMedia({
      model: { type: 'User', id: 'pg-u2' },
      file: { buffer: imageJpg, originalname: 'b.jpg' },
      collection: 'gallery',
    })
    expect(a.orderColumn).toBe(0)
    expect(b.orderColumn).toBe(1)

    await media!.reorder([b.id, a.id])
    const list = await media!.list({ type: 'User', id: 'pg-u2' }, 'gallery')
    expect(list.map((m) => m.fileName)).toEqual(['b.jpg', 'a.jpg'])
  })

  test('updateCustomProperties persists merged JSON', async () => {
    if (!pgReachable) return
    const record = await media!.addMedia({
      model: { type: 'User', id: 'pg-u3' },
      file: { buffer: imageJpg, originalname: 'image.jpg' },
      collection: 'avatars',
      customProperties: { alt: 'one' },
    })
    const updated = await media!.updateCustomProperties(record.id, { caption: 'two' })
    expect(updated.customProperties).toEqual({ alt: 'one', caption: 'two' })

    const refetched = await media!.get(record.id)
    expect(refetched?.customProperties).toEqual({ alt: 'one', caption: 'two' })
  })
})
