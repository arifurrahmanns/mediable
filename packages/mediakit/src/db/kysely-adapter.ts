import { createRequire } from 'node:module'
import { Kysely, MysqlDialect, PostgresDialect, SqliteDialect, sql } from 'kysely'

declare const __filename: string | undefined
const requireShim = createRequire(
  typeof __filename !== 'undefined' ? __filename : import.meta.url,
)

function tryRequire(id: string): any | null {
  try {
    return requireShim(id)
  } catch {
    return null
  }
}

import type { MediaRecord } from '../types'
import type { CreateInput, DatabaseAdapter, ListQuery } from './types'
import type { KyselyDatabaseSchema, MediaTableRow } from './kysely-schema'

export interface KyselyAdapterOptions {
  autoMigrate?: boolean
}

export interface BuiltInSqliteConfig {
  provider: 'sqlite'
  connection: { url?: string; filename?: string }
  autoMigrate?: boolean
}

export interface BuiltInPostgresConfig {
  provider: 'postgres'
  connection: { url: string }
  autoMigrate?: boolean
}

export interface BuiltInMysqlConfig {
  provider: 'mysql'
  connection: { url: string }
  autoMigrate?: boolean
}

export interface BuiltInMongoConfig {
  provider: 'mongodb'
  connection: { url: string }
}

export type BuiltInDatabaseConfig =
  | BuiltInSqliteConfig
  | BuiltInPostgresConfig
  | BuiltInMysqlConfig
  | BuiltInMongoConfig

export function kyselyAdapter(
  db: Kysely<KyselyDatabaseSchema>,
  opts: KyselyAdapterOptions = {},
): DatabaseAdapter & { migrate: () => Promise<void>; close: () => Promise<void> } {
  let migrated = false

  const ensureMigrated = async () => {
    if (migrated) return
    if (opts.autoMigrate) await migrate()
    migrated = true
  }

  const migrate = async () => {
    await db.schema
      .createTable('media')
      .ifNotExists()
      .addColumn('id', 'text', (c) => c.primaryKey())
      .addColumn('uuid', 'text', (c) => c.notNull().unique())
      .addColumn('model_type', 'text', (c) => c.notNull())
      .addColumn('model_id', 'text', (c) => c.notNull())
      .addColumn('collection_name', 'text', (c) => c.notNull().defaultTo('default'))
      .addColumn('name', 'text', (c) => c.notNull())
      .addColumn('file_name', 'text', (c) => c.notNull())
      .addColumn('mime_type', 'text', (c) => c.notNull())
      .addColumn('disk', 'text', (c) => c.notNull())
      .addColumn('conversions_disk', 'text', (c) => c.notNull())
      .addColumn('size', 'integer', (c) => c.notNull().defaultTo(0))
      .addColumn('manipulations', 'text', (c) => c.notNull().defaultTo('{}'))
      .addColumn('custom_properties', 'text', (c) => c.notNull().defaultTo('{}'))
      .addColumn('generated_conversions', 'text', (c) => c.notNull().defaultTo('{}'))
      .addColumn('responsive_images', 'text', (c) => c.notNull().defaultTo('{}'))
      .addColumn('order_column', 'integer', (c) => c.notNull().defaultTo(0))
      .addColumn('status', 'text', (c) => c.notNull().defaultTo('ready'))
      .addColumn('optimized_at', 'text')
      .addColumn('created_at', 'text', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('updated_at', 'text', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .execute()

    await db.schema
      .createIndex('media_owner_idx')
      .ifNotExists()
      .on('media')
      .columns(['model_type', 'model_id'])
      .execute()

    await db.schema
      .createIndex('media_owner_collection_idx')
      .ifNotExists()
      .on('media')
      .columns(['model_type', 'model_id', 'collection_name'])
      .execute()

    await db.schema
      .createIndex('media_status_created_idx')
      .ifNotExists()
      .on('media')
      .columns(['status', 'created_at'])
      .execute()
  }

  const rowToRecord = (row: MediaTableRow): MediaRecord => ({
    id: row.id,
    uuid: row.uuid,
    modelType: row.model_type,
    modelId: row.model_id,
    collectionName: row.collection_name,
    name: row.name,
    fileName: row.file_name,
    mimeType: row.mime_type,
    disk: row.disk,
    conversionsDisk: row.conversions_disk,
    size: row.size,
    manipulations: JSON.parse(row.manipulations),
    customProperties: JSON.parse(row.custom_properties),
    generatedConversions: JSON.parse(row.generated_conversions),
    responsiveImages: JSON.parse(row.responsive_images),
    orderColumn: row.order_column,
    status: row.status,
    optimizedAt: row.optimized_at ? new Date(row.optimized_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  })

  const recordToRow = (data: Partial<MediaRecord>): Partial<MediaTableRow> => {
    const row: Partial<MediaTableRow> = {}
    if (data.id !== undefined) row.id = data.id
    if (data.uuid !== undefined) row.uuid = data.uuid
    if (data.modelType !== undefined) row.model_type = data.modelType
    if (data.modelId !== undefined) row.model_id = String(data.modelId)
    if (data.collectionName !== undefined) row.collection_name = data.collectionName
    if (data.name !== undefined) row.name = data.name
    if (data.fileName !== undefined) row.file_name = data.fileName
    if (data.mimeType !== undefined) row.mime_type = data.mimeType
    if (data.disk !== undefined) row.disk = data.disk
    if (data.conversionsDisk !== undefined) row.conversions_disk = data.conversionsDisk
    if (data.size !== undefined) row.size = data.size
    if (data.manipulations !== undefined) row.manipulations = JSON.stringify(data.manipulations)
    if (data.customProperties !== undefined)
      row.custom_properties = JSON.stringify(data.customProperties)
    if (data.generatedConversions !== undefined)
      row.generated_conversions = JSON.stringify(data.generatedConversions)
    if (data.responsiveImages !== undefined)
      row.responsive_images = JSON.stringify(data.responsiveImages)
    if (data.orderColumn !== undefined) row.order_column = data.orderColumn
    if (data.status !== undefined) row.status = data.status
    if (data.optimizedAt !== undefined)
      row.optimized_at = data.optimizedAt ? data.optimizedAt.toISOString() : null
    return row
  }

  const applyWhere = <Q>(qb: any, where: Partial<MediaRecord>): Q => {
    const mapped = recordToRow(where)
    let q = qb
    for (const [k, v] of Object.entries(mapped)) {
      q = q.where(k as any, '=', v as any)
    }
    return q as Q
  }

  return {
    id: 'kysely',
    migrate,
    close: async () => {
      await db.destroy()
    },

    async create(_model, data: CreateInput) {
      await ensureMigrated()
      const now = new Date().toISOString()
      const row = recordToRow({
        ...data,
        modelId: String(data.modelId),
      }) as MediaTableRow
      row.created_at = now
      row.updated_at = now
      await db.insertInto('media').values(row).execute()
      const inserted = await db
        .selectFrom('media')
        .where('id', '=', row.id)
        .selectAll()
        .executeTakeFirstOrThrow()
      return rowToRecord(inserted) as any
    },

    async findOne(_model, where) {
      await ensureMigrated()
      let q: any = db.selectFrom('media').selectAll()
      q = applyWhere(q, where as Partial<MediaRecord>)
      const row = await q.executeTakeFirst()
      return row ? (rowToRecord(row as MediaTableRow) as any) : null
    },

    async findMany(_model, query: ListQuery) {
      await ensureMigrated()
      let q: any = db.selectFrom('media').selectAll()
      if (query.where) q = applyWhere(q, query.where as Partial<MediaRecord>)
      if (query.orderBy) {
        for (const o of query.orderBy) {
          const col = columnOf(o.field)
          q = q.orderBy(col, o.dir)
        }
      }
      if (query.limit !== undefined) q = q.limit(query.limit)
      if (query.offset !== undefined) q = q.offset(query.offset)
      const rows = await q.execute()
      return (rows as MediaTableRow[]).map(rowToRecord) as any
    },

    async update(_model, where, data) {
      await ensureMigrated()
      const patch = recordToRow(data as Partial<MediaRecord>)
      patch.updated_at = new Date().toISOString()
      let q: any = db.updateTable('media').set(patch)
      q = applyWhere(q, where as Partial<MediaRecord>)
      await q.execute()
      const found = await this.findOne(_model, where)
      if (!found) throw new Error('update target not found')
      return found as any
    },

    async delete(_model, where) {
      await ensureMigrated()
      let q: any = db.deleteFrom('media')
      q = applyWhere(q, where as Partial<MediaRecord>)
      await q.execute()
    },
  }
}

function columnOf(field: keyof MediaRecord): keyof MediaTableRow {
  const map: Record<keyof MediaRecord, keyof MediaTableRow> = {
    id: 'id',
    uuid: 'uuid',
    modelType: 'model_type',
    modelId: 'model_id',
    collectionName: 'collection_name',
    name: 'name',
    fileName: 'file_name',
    mimeType: 'mime_type',
    disk: 'disk',
    conversionsDisk: 'conversions_disk',
    size: 'size',
    manipulations: 'manipulations',
    customProperties: 'custom_properties',
    generatedConversions: 'generated_conversions',
    responsiveImages: 'responsive_images',
    orderColumn: 'order_column',
    status: 'status',
    optimizedAt: 'optimized_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
  return map[field]
}

export function createSqliteKysely(opts: {
  filename?: string
  url?: string
}): Kysely<KyselyDatabaseSchema> {
  const filename =
    opts.filename ??
    (opts.url?.startsWith('file:') ? opts.url.slice('file:'.length) : opts.url) ??
    ':memory:'
  const BetterSqlite3 = requireShim('better-sqlite3')
  if (filename !== ':memory:') {
    const { mkdirSync } = requireShim('node:fs')
    const { dirname, resolve } = requireShim('node:path')
    mkdirSync(dirname(resolve(filename)), { recursive: true })
  }
  const sqlite = new BetterSqlite3(filename)
  return new Kysely<KyselyDatabaseSchema>({
    dialect: new SqliteDialect({ database: sqlite }),
  })
}

export function createPostgresKysely(opts: { url: string }): Kysely<KyselyDatabaseSchema> {
  const pg = tryRequire('pg')
  if (!pg) {
    throw new Error(
      "PostgreSQL provider requires the 'pg' package. Install with: pnpm add pg",
    )
  }
  const Pool = pg.Pool ?? pg.default?.Pool
  const pool = new Pool({ connectionString: opts.url })
  return new Kysely<KyselyDatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
  })
}

export function createMysqlKysely(opts: { url: string }): Kysely<KyselyDatabaseSchema> {
  const mysql = tryRequire('mysql2')
  if (!mysql) {
    throw new Error(
      "MySQL provider requires the 'mysql2' package. Install with: pnpm add mysql2",
    )
  }
  const createPool = mysql.createPool ?? mysql.default?.createPool
  const pool = createPool({ uri: opts.url })
  return new Kysely<KyselyDatabaseSchema>({
    dialect: new MysqlDialect({ pool }),
  })
}
