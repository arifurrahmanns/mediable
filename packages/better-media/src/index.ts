export { betterMedia, type BetterMediaInstance } from './factory'
export type { BetterMediaConfig, ResolvedConfig } from './config'

export { LocalStorage } from './storage/local'
export type { LocalStorageDriver, LocalStorageOptions } from './storage/local'
export {
  defaultPathGenerator,
  sanitizeFileName,
  buildPathContext,
} from './storage/path'
export type {
  StorageDriver,
  PathGenerator,
  PathContext,
  PutOptions,
  PutResult,
  StreamRange,
  StreamResult,
  PresignUploadOptions,
  PresignUploadResult,
} from './storage/types'

export type {
  DatabaseAdapter,
  CreateInput,
  ListQuery,
} from './db/types'
export { MediaRepository } from './db/repository'
export {
  kyselyAdapter,
  createSqliteKysely,
  createPostgresKysely,
  createMysqlKysely,
  type KyselyAdapterOptions,
  type BuiltInDatabaseConfig,
  type BuiltInSqliteConfig,
  type BuiltInPostgresConfig,
  type BuiltInMysqlConfig,
  type BuiltInMongoConfig,
} from './db/kysely-adapter'
export type { KyselyDatabaseSchema, MediaTableRow } from './db/kysely-schema'

export type { MediaRecord, MediaSchema, Json, OwnerRef, Logger } from './types'

export type {
  OwnerBuilder,
  OwnerCallback,
  CollectionBuilder,
  SharedConversionBuilder,
  CollectionConfig,
  OwnerConfig,
  MimeMatcher,
  SizeSpec,
} from './owners/types'

export type {
  ImageProcessor,
  ImageBuilder,
  ImageFormat,
  FitMode,
  ConversionPlan,
} from './image/types'

export type { Queue, EnqueueOptions } from './queue/types'
export { createInProcessQueue } from './queue/in-process'

export type {
  MediaEventMap,
  MediaEventName,
  MediaEventHandlers,
  EventBus,
} from './events'

export { MediaAttacher } from './api/attacher'
export type { AttachInput, AttachSource } from './api/attacher'
export type {
  MediaClient,
  AddMediaInput,
  AttachFile,
  MediaUrlOptions,
  MediaStreamOptions,
} from './api'
export type { ConvertOptions } from './owners/types'
