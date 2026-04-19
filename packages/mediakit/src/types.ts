export type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

export type OwnerRef = { type: string; id: string | number }

export interface MediaRecord {
  id: string
  uuid: string
  modelType: string
  modelId: string
  collectionName: string
  name: string
  fileName: string
  mimeType: string
  disk: string
  conversionsDisk: string
  size: number
  manipulations: Json
  customProperties: Json
  generatedConversions: Record<string, boolean>
  responsiveImages: Json
  orderColumn: number
  status: 'pending' | 'ready' | 'failed'
  optimizedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface MediaSchema {
  media: MediaRecord
}

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void
  info(msg: string, meta?: Record<string, unknown>): void
  warn(msg: string, meta?: Record<string, unknown>): void
  error(msg: string, meta?: Record<string, unknown>): void
}
