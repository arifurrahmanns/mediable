import type { ConversionPlan, ImageBuilder } from '../image/types'

export type SizeSpec = number | `${number}${'B' | 'KB' | 'MB' | 'GB'}`

export type MimeMatcher =
  | { kind: 'exact'; value: string }
  | { kind: 'wildcard'; prefix: string }
  | { kind: 'regex'; value: RegExp }
  | { kind: 'ext'; value: string }

export interface CollectionConfig {
  name: string
  singleFile: boolean
  replacesExisting: boolean
  accepts: MimeMatcher[]
  maxFileSize: number | null
  maxNumberOfFiles: number | null
  disk: string | null
  conversionsDisk: string | null
  fallbackUrl: string | null
  preservingOriginal: boolean
  conversions: ConversionPlan[]
}

export interface SharedConversion {
  plan: ConversionPlan
  performOn: string[] | null
}

export interface OwnerConfig {
  name: string
  collections: Map<string, CollectionConfig>
  sharedConversions: SharedConversion[]
}

/** Options for an individual conversion. */
export interface ConvertOptions {
  /** Run in the queue instead of inline during upload. */
  queued?: boolean
  /** Job priority when queued. Lower = higher priority (BullMQ convention). */
  priority?: number
}

export interface CollectionBuilder {
  singleFile(): this
  accepts(...mimesOrExtsOrPatterns: string[]): this
  maxSize(size: SizeSpec): this
  maxFiles(n: number): this
  disk(name: string): this
  conversionsDisk(name: string): this
  fallbackUrl(url: string): this
  preservingOriginal(): this
  convert(
    name: string,
    fn: (b: ImageBuilder) => ImageBuilder,
    opts?: ConvertOptions,
  ): this
}

export interface SharedConversionBuilder {
  performOn(...collections: string[]): this
  queued(): this
  /** Job priority when queued. Lower = higher priority. */
  priority(n: number): this
}

export interface OwnerBuilder {
  collection(name: string): CollectionBuilder
  convert(name: string, fn: (b: ImageBuilder) => ImageBuilder): SharedConversionBuilder
}

export type OwnerCallback = (builder: OwnerBuilder) => void
