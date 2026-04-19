import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { Readable } from 'node:stream'
import { fileTypeFromBuffer } from 'file-type'
import { newMediaId, newUuid } from '../ids'
import type { ResolvedConfig } from '../config'
import type { MediaRepository } from '../db/repository'
import type { CollectionConfig } from '../owners/types'
import type { StorageDriver } from '../storage/types'
import type { MediaRecord, OwnerRef } from '../types'
import { getOwnerConfig } from '../owners/resolve'
import { matches as matchesMime } from '../owners/mime'
import { sanitizeFileName, buildPathContext } from '../storage/path'
import { runConversions } from '../conversions/run'

export type AttachSource =
  | { kind: 'file'; path: string }
  | { kind: 'buffer'; data: Buffer; filename: string; contentType?: string }
  | { kind: 'stream'; stream: Readable; filename: string; size?: number; contentType?: string }
  | { kind: 'url'; url: string; timeoutMs?: number; maxBytes?: number }
  | { kind: 'base64'; data: string; filename: string }
  | { kind: 'fetch-file'; file: File; filename: string }

export interface AttachInput {
  owner: OwnerRef
  source: AttachSource
  collection?: string
  disk?: string
  name?: string
  fileName?: string
  customProperties?: Record<string, unknown>
  order?: number
  preservingOriginal?: boolean
  status?: 'pending' | 'ready'
}

export class MediaAttacher {
  private _source: AttachSource | null = null
  private _collection = 'default'
  private _disk: string | null = null
  private _name: string | null = null
  private _fileName: string | null = null
  private _customProperties: Record<string, unknown> = {}
  private _order: number | null = null
  private _preservingOriginal = false

  constructor(
    private readonly owner: OwnerRef,
    private readonly api: AttacherContext,
  ) {}

  addFromFile(path: string): this {
    this._source = { kind: 'file', path }
    return this
  }
  addFromBuffer(data: Buffer | Uint8Array, filename: string): this {
    this._source = {
      kind: 'buffer',
      data: Buffer.isBuffer(data) ? data : Buffer.from(data),
      filename,
    }
    return this
  }
  addFromStream(stream: Readable, filename: string, opts: { size?: number; contentType?: string } = {}): this {
    this._source = { kind: 'stream', stream, filename, ...opts }
    return this
  }
  addFromUrl(url: string, opts: { timeoutMs?: number; maxBytes?: number } = {}): this {
    this._source = { kind: 'url', url, ...opts }
    return this
  }
  addFromBase64(data: string, filename: string): this {
    this._source = { kind: 'base64', data, filename }
    return this
  }

  toCollection(name: string): this {
    this._collection = name
    return this
  }
  usingDisk(name: string): this {
    this._disk = name
    return this
  }
  withName(name: string): this {
    this._name = name
    return this
  }
  withFileName(fileName: string): this {
    this._fileName = fileName
    return this
  }
  withCustomProperties(props: Record<string, unknown>): this {
    this._customProperties = { ...this._customProperties, ...props }
    return this
  }
  withOrder(order: number): this {
    this._order = order
    return this
  }
  preservingOriginal(): this {
    this._preservingOriginal = true
    return this
  }

  async save(): Promise<MediaRecord> {
    if (!this._source) throw new Error('MediaAttacher: no source. Call addFrom*() first.')
    return this.api.attach({
      owner: this.owner,
      source: this._source,
      collection: this._collection,
      disk: this._disk ?? undefined,
      name: this._name ?? undefined,
      fileName: this._fileName ?? undefined,
      customProperties: this._customProperties,
      order: this._order ?? undefined,
      preservingOriginal: this._preservingOriginal,
    })
  }
}

export interface AttacherContext {
  attach(input: AttachInput): Promise<MediaRecord>
}

export async function performAttach(
  input: AttachInput,
  config: ResolvedConfig,
  repo: MediaRepository,
): Promise<MediaRecord> {
  const ownerConfig = getOwnerConfig(config.owners, input.owner.type)
  const collectionName = input.collection ?? 'default'
  const collectionConfig = ownerConfig?.collections.get(collectionName) ?? null

  const loaded = await loadSource(input.source, collectionConfig)

  validateAgainstCollection(collectionConfig, loaded.mimeType, loaded.size, loaded.fileName)

  const diskName = input.disk ?? collectionConfig?.disk ?? config.storage.defaultDisk
  const conversionsDiskName =
    collectionConfig?.conversionsDisk ?? diskName
  const disk = config.storage.disks[diskName]
  if (!disk) throw new Error(`storage disk not found: ${diskName}`)

  if (collectionConfig?.singleFile || collectionConfig?.replacesExisting) {
    const existing = await repo.findByOwner(input.owner, collectionName)
    for (const prev of existing) {
      await deleteFilesForRecord(prev, config)
      await repo.delete(prev.id)
    }
  }

  const id = newMediaId()
  const uuid = newUuid()
  const fileName = sanitizeFileName(input.fileName ?? loaded.fileName)
  const ctx = buildPathContext({
    mediaId: id,
    uuid,
    modelType: input.owner.type,
    modelId: String(input.owner.id),
    collectionName,
    fileName,
  })
  const key = config.pathGenerator.original(ctx)

  await disk.put(key, loaded.body, {
    contentType: loaded.mimeType,
    contentLength: loaded.size,
  })

  const order =
    input.order ??
    (await repo.nextOrderColumn(input.owner, collectionName))

  const record = await repo.create({
    id,
    uuid,
    modelType: input.owner.type,
    modelId: String(input.owner.id),
    collectionName,
    name: input.name ?? stripExtension(fileName),
    fileName,
    mimeType: loaded.mimeType,
    disk: diskName,
    conversionsDisk: conversionsDiskName,
    size: loaded.size,
    manipulations: {},
    customProperties: (input.customProperties ?? {}) as any,
    generatedConversions: {},
    responsiveImages: {},
    orderColumn: order,
    status: input.status ?? 'ready',
    optimizedAt: null,
  })

  await config.events.emit('onMediaAdded', { media: record })

  if (collectionConfig) {
    await runConversions({
      media: record,
      collection: collectionConfig,
      ownerConfig,
      config,
      repo,
    })
  }

  // Re-fetch so inline-conversion updates (generatedConversions, optimizedAt) are visible.
  const fresh = await repo.findById(record.id)
  return fresh ?? record
}

async function deleteFilesForRecord(record: MediaRecord, config: ResolvedConfig): Promise<void> {
  const ctx = buildPathContext({
    mediaId: record.id,
    uuid: record.uuid,
    modelType: record.modelType,
    modelId: record.modelId,
    collectionName: record.collectionName,
    fileName: record.fileName,
  })
  const disk = config.storage.disks[record.disk]
  if (disk) {
    const key = config.pathGenerator.original(ctx)
    await disk.delete(key).catch(() => {})
    for (const [name, done] of Object.entries(record.generatedConversions)) {
      if (!done) continue
      const ext = (record.fileName.split('.').pop() ?? 'bin').toLowerCase()
      const ckey = config.pathGenerator.conversion(ctx, name, ext)
      await disk.delete(ckey).catch(() => {})
    }
  }
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? filename.slice(0, dot) : filename
}

interface LoadedSource {
  body: Buffer | Readable
  size: number
  mimeType: string
  fileName: string
}

async function loadSource(
  source: AttachSource,
  collection: CollectionConfig | null,
): Promise<LoadedSource> {
  switch (source.kind) {
    case 'file': {
      const stats = await stat(source.path)
      const buf = await readFileBuffer(source.path)
      const mimeType = await sniffMime(buf, basename(source.path))
      return {
        body: buf,
        size: stats.size,
        mimeType,
        fileName: basename(source.path),
      }
    }
    case 'buffer': {
      const mimeType = source.contentType ?? (await sniffMime(source.data, source.filename))
      return {
        body: source.data,
        size: source.data.byteLength,
        mimeType,
        fileName: source.filename,
      }
    }
    case 'fetch-file': {
      const buf = Buffer.from(await source.file.arrayBuffer())
      const mimeType = source.file.type || (await sniffMime(buf, source.filename))
      return {
        body: buf,
        size: buf.byteLength,
        mimeType,
        fileName: source.filename,
      }
    }
    case 'stream': {
      const chunks: Buffer[] = []
      let size = source.size ?? 0
      for await (const chunk of source.stream) {
        const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        chunks.push(b)
        if (source.size === undefined) size += b.byteLength
        if (collection?.maxFileSize && size > collection.maxFileSize) {
          throw new Error(
            `file exceeds max size ${collection.maxFileSize} bytes`,
          )
        }
      }
      const buf = Buffer.concat(chunks)
      const mimeType = source.contentType ?? (await sniffMime(buf, source.filename))
      return { body: buf, size: buf.byteLength, mimeType, fileName: source.filename }
    }
    case 'url': {
      const ctrl = new AbortController()
      const timeout = source.timeoutMs ?? 30_000
      const timer = setTimeout(() => ctrl.abort(), timeout)
      try {
        const res = await fetch(source.url, { signal: ctrl.signal })
        if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
        const buf = Buffer.from(await res.arrayBuffer())
        if (source.maxBytes && buf.byteLength > source.maxBytes) {
          throw new Error(`remote file exceeds max ${source.maxBytes} bytes`)
        }
        const filename = extractFilenameFromUrl(source.url)
        const mimeType =
          res.headers.get('content-type')?.split(';')[0]?.trim() ??
          (await sniffMime(buf, filename))
        return { body: buf, size: buf.byteLength, mimeType, fileName: filename }
      } finally {
        clearTimeout(timer)
      }
    }
    case 'base64': {
      const buf = Buffer.from(source.data, 'base64')
      const mimeType = await sniffMime(buf, source.filename)
      return { body: buf, size: buf.byteLength, mimeType, fileName: source.filename }
    }
  }
}

async function readFileBuffer(path: string): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of createReadStream(path)) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

async function sniffMime(buf: Buffer, filename: string): Promise<string> {
  const sniff = await fileTypeFromBuffer(buf)
  if (sniff) return sniff.mime
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const fallback: Record<string, string> = {
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    json: 'application/json',
    svg: 'image/svg+xml',
  }
  return fallback[ext] ?? 'application/octet-stream'
}

function extractFilenameFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').filter(Boolean).pop()
    return last ?? 'download'
  } catch {
    return 'download'
  }
}

function validateAgainstCollection(
  collection: CollectionConfig | null,
  mimeType: string,
  size: number,
  fileName: string,
): void {
  if (!collection) return
  if (collection.accepts.length > 0) {
    if (!matchesMime(collection.accepts, mimeType, fileName)) {
      throw new Error(
        `mime type '${mimeType}' is not accepted by collection '${collection.name}'`,
      )
    }
  }
  if (collection.maxFileSize !== null && size > collection.maxFileSize) {
    throw new Error(
      `file size ${size} exceeds max ${collection.maxFileSize} for collection '${collection.name}'`,
    )
  }
}
