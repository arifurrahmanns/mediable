import type { ImageBuilder } from '../image/types'
import { PlanCapturingBuilder } from '../image/types'
import type {
  CollectionBuilder,
  CollectionConfig,
  ConvertOptions,
  OwnerBuilder,
  OwnerCallback,
  OwnerConfig,
  SharedConversion,
  SharedConversionBuilder,
  SizeSpec,
} from './types'
import { parseSize } from './size'
import { parseMatcher } from './mime'

class CollectionBuilderImpl implements CollectionBuilder {
  constructor(readonly config: CollectionConfig) {}

  singleFile(): this {
    this.config.singleFile = true
    this.config.replacesExisting = true
    this.config.maxNumberOfFiles = 1
    return this
  }
  accepts(...inputs: string[]): this {
    for (const raw of inputs) {
      this.config.accepts.push(parseMatcher(raw))
    }
    return this
  }
  maxSize(size: SizeSpec): this {
    this.config.maxFileSize = parseSize(size)
    return this
  }
  maxFiles(n: number): this {
    this.config.maxNumberOfFiles = n
    return this
  }
  disk(name: string): this {
    this.config.disk = name
    return this
  }
  conversionsDisk(name: string): this {
    this.config.conversionsDisk = name
    return this
  }
  fallbackUrl(url: string): this {
    this.config.fallbackUrl = url
    return this
  }
  preservingOriginal(): this {
    this.config.preservingOriginal = true
    return this
  }
  convert(
    name: string,
    fn: (b: ImageBuilder) => ImageBuilder,
    opts?: ConvertOptions,
  ): this {
    const plan = capturePlan(name, fn, opts)
    this.config.conversions.push(plan)
    return this
  }
}

class SharedConversionBuilderImpl implements SharedConversionBuilder {
  constructor(private readonly entry: SharedConversion) {}
  performOn(...collections: string[]): this {
    this.entry.performOn = collections
    return this
  }
  queued(): this {
    this.entry.plan.queued = true
    return this
  }
  priority(n: number): this {
    this.entry.plan.priority = n
    return this
  }
}

function capturePlan(
  name: string,
  fn: (b: ImageBuilder) => ImageBuilder,
  opts: ConvertOptions = {},
) {
  const builder = new PlanCapturingBuilder()
  fn(builder)
  const format = builder.outputFormat
  const ext = builder.outputExt ?? 'bin'
  return {
    name,
    ops: [...builder.ops],
    queued: opts.queued ?? false,
    priority: opts.priority,
    outputExt: ext,
    outputFormat: format,
  }
}

export function runOwnerCallback(name: string, cb: OwnerCallback): OwnerConfig {
  const config: OwnerConfig = {
    name,
    collections: new Map(),
    sharedConversions: [],
  }

  const getOrCreateCollection = (collectionName: string): CollectionConfig => {
    const existing = config.collections.get(collectionName)
    if (existing) return existing
    const created: CollectionConfig = {
      name: collectionName,
      singleFile: false,
      replacesExisting: false,
      accepts: [],
      maxFileSize: null,
      maxNumberOfFiles: null,
      disk: null,
      conversionsDisk: null,
      fallbackUrl: null,
      preservingOriginal: false,
      conversions: [],
    }
    config.collections.set(collectionName, created)
    return created
  }

  const builder: OwnerBuilder = {
    collection(collectionName) {
      return new CollectionBuilderImpl(getOrCreateCollection(collectionName))
    },
    convert(conversionName, fn) {
      const entry: SharedConversion = {
        plan: capturePlan(conversionName, fn),
        performOn: null,
      }
      config.sharedConversions.push(entry)
      return new SharedConversionBuilderImpl(entry)
    },
  }

  cb(builder)
  return config
}
