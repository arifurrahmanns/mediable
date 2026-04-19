import type { DatabaseAdapter } from './db/types'
import type { BuiltInDatabaseConfig } from './db/kysely-adapter'
import type { EventBus, MediaEventHandlers } from './events'
import type { ImageProcessor } from './image/types'
import type { Queue } from './queue/types'
import type { StorageDriver, PathGenerator } from './storage/types'
import type { OwnerCallback } from './owners/types'
import type { Logger } from './types'
import type { ResolvedOwners } from './owners/resolve'

export interface MediableConfig {
  /** HMAC signing secret. Required, min 16 chars. Used to sign local temporary URLs. */
  secret: string
  database: DatabaseAdapter | BuiltInDatabaseConfig
  storage: {
    default: string
    disks: Record<string, StorageDriver>
  }
  image?: ImageProcessor
  queue?: Queue
  pathGenerator?: PathGenerator
  owners?: Record<string, OwnerCallback>
  events?: MediaEventHandlers
  logger?: Logger
}

export interface ResolvedConfig {
  secret: string
  db: DatabaseAdapter
  storage: {
    defaultDisk: string
    disks: Record<string, StorageDriver>
  }
  image: ImageProcessor | null
  queue: Queue
  pathGenerator: PathGenerator
  owners: ResolvedOwners
  events: EventBus
  logger: Logger
}

export function validateConfig(config: MediableConfig): void {
  if (!config.secret || typeof config.secret !== 'string' || config.secret.length < 16) {
    throw new Error('MediableConfig.secret is required and must be at least 16 characters')
  }
  if (!config.storage || !config.storage.default || !config.storage.disks) {
    throw new Error('MediableConfig.storage.default and .disks are required')
  }
  if (!config.storage.disks[config.storage.default]) {
    throw new Error(
      `MediableConfig.storage.default '${config.storage.default}' not found in disks`,
    )
  }
  if (!config.database) {
    throw new Error('MediableConfig.database is required')
  }
}

export function noopLogger(): Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: (msg, meta) => console.warn(`[mediable] ${msg}`, meta ?? ''),
    error: (msg, meta) => console.error(`[mediable] ${msg}`, meta ?? ''),
  }
}
