import { createClient, type MediaClient } from './api'
import {
  noopLogger,
  validateConfig,
  type BetterMediaConfig,
  type ResolvedConfig,
} from './config'
import { executeOne } from './conversions/run'
import {
  createMysqlKysely,
  createPostgresKysely,
  createSqliteKysely,
  kyselyAdapter,
  type BuiltInDatabaseConfig,
} from './db/kysely-adapter'
import { mongooseAdapter } from './mongoose'
import { MediaRepository } from './db/repository'
import type { DatabaseAdapter } from './db/types'
import { createEventBus } from './events'
import { resolveOwners } from './owners/resolve'
import { createInProcessQueue } from './queue/in-process'
import type { StorageDriver } from './storage/types'
import { defaultPathGenerator } from './storage/path'
import type { Logger } from './types'

/**
 * A better-media instance. This is the headless surface: a set of functions
 * you call from your own route handlers, controllers, workers, or scripts.
 *
 * There is no HTTP handler here — your framework owns routing, parsing, and
 * authorization. Call `mm.addMedia(...)` from inside your route and return
 * the result however your app returns things.
 */
export interface BetterMediaInstance extends MediaClient {
  /**
   * Apply the database schema for the configured adapter.
   *
   *  - Kysely-based (SQLite / Postgres / MySQL): runs the idempotent
   *    `CREATE TABLE IF NOT EXISTS` + indexes.
   *  - Mongoose (MongoDB): connects if needed, then `createIndexes()`.
   *  - Custom adapters: calls `.migrate()` / `.ensureIndexes()` if the
   *    adapter exposes one; otherwise a no-op.
   *
   * Safe to call more than once. Intended for deploy/CI scripts and
   * `npx better-media migrate`.
   */
  migrate(): Promise<void>

  /** Resolved internals — for plugins and advanced integration. */
  $context: {
    config: ResolvedConfig
    repo: MediaRepository
  }
}

export function betterMedia(userConfig: BetterMediaConfig): BetterMediaInstance {
  validateConfig(userConfig)

  const logger: Logger = userConfig.logger ?? noopLogger()

  const db = resolveDatabase(userConfig.database)
  const queue =
    userConfig.queue ??
    createInProcessQueue({
      onError: (j, e) => logger.error(`queue ${j} failed`, { err: String(e) }),
    })
  const pathGenerator = userConfig.pathGenerator ?? defaultPathGenerator

  ensureLocalDisksHaveSecret(userConfig.storage.disks, userConfig.secret)

  const owners = resolveOwners(userConfig.owners)
  const events = createEventBus(userConfig.events)

  const config: ResolvedConfig = {
    secret: userConfig.secret,
    db,
    storage: {
      defaultDisk: userConfig.storage.default,
      disks: userConfig.storage.disks,
    },
    image: userConfig.image ?? null,
    queue,
    pathGenerator,
    owners,
    events,
    logger,
  }

  const repo = new MediaRepository(db)
  const client = createClient(config, repo)

  queue.process<{ mediaId: string; conversionName: string }>(
    'better-media:generate-conversion',
    async ({ mediaId, conversionName }) => {
      const media = await repo.findById(mediaId)
      if (!media) return
      const owner = owners.byType.get(media.modelType) ?? owners.wildcard
      if (!owner) return
      const collection = owner.collections.get(media.collectionName)
      if (!collection) return
      const plan =
        collection.conversions.find((p) => p.name === conversionName) ??
        owner.sharedConversions.find((s) => s.plan.name === conversionName)?.plan
      if (!plan) return
      await executeOne({ media, plan, config, repo })
    },
  )

  const migrate = async (): Promise<void> => {
    const adapter = db as DatabaseAdapter & {
      migrate?: () => Promise<void>
      ensureIndexes?: () => Promise<void>
    }
    if (typeof adapter.migrate === 'function') await adapter.migrate()
    if (typeof adapter.ensureIndexes === 'function') await adapter.ensureIndexes()
  }

  return Object.assign(client, {
    migrate,
    $context: { config, repo },
  })
}

function resolveDatabase(input: DatabaseAdapter | BuiltInDatabaseConfig): DatabaseAdapter {
  if ('id' in input && typeof input.id === 'string') {
    return input as DatabaseAdapter
  }
  const builtIn = input as BuiltInDatabaseConfig
  switch (builtIn.provider) {
    case 'sqlite': {
      const db = createSqliteKysely({
        filename: builtIn.connection.filename,
        url: builtIn.connection.url,
      })
      return kyselyAdapter(db, { autoMigrate: builtIn.autoMigrate ?? true })
    }
    case 'postgres': {
      const db = createPostgresKysely({ url: builtIn.connection.url })
      return kyselyAdapter(db, { autoMigrate: builtIn.autoMigrate ?? true })
    }
    case 'mysql': {
      const db = createMysqlKysely({ url: builtIn.connection.url })
      return kyselyAdapter(db, { autoMigrate: builtIn.autoMigrate ?? true })
    }
    case 'mongodb': {
      return mongooseAdapter({ url: builtIn.connection.url })
    }
    default:
      throw new Error(
        `unsupported built-in database provider: ${(builtIn as any).provider}`,
      )
  }
}

function ensureLocalDisksHaveSecret(
  disks: Record<string, StorageDriver>,
  secret: string,
): void {
  for (const driver of Object.values(disks)) {
    if (driver.name === 'local') {
      const opts = (driver as any).__opts as { signingSecret?: string } | undefined
      if (opts) {
        opts.signingSecret = opts.signingSecret ?? secret
      }
    }
  }
}
