import type { Readable } from 'node:stream'
import type { ResolvedConfig } from '../config'
import type { MediaRepository } from '../db/repository'
import { executeOne } from '../conversions/run'
import { buildPathContext } from '../storage/path'
import type { MediaRecord, OwnerRef } from '../types'
import type { StreamResult } from '../storage/types'
import { verifyLocalSignedToken } from '../storage/local'
import { MediaAttacher, performAttach, type AttachInput, type AttachSource } from './attacher'
import {
  performConfirmUpload,
  performPresignUpload,
  type ConfirmUploadInput,
  type PresignUploadInput,
  type PresignUploadResult,
} from './presign'

/**
 * File-like inputs accepted by `mm.addMedia()`. Covers raw data and most
 * framework conventions so you can pass whatever your multipart middleware
 * hands you, unchanged.
 */
export type AttachFile =
  | Buffer
  | Uint8Array
  | Readable
  | { path: string }
  | { buffer: Buffer; originalname: string; mimetype?: string; size?: number }
  | { stream: Readable; filename: string; mimetype?: string; size?: number }
  | { data: string; filename: string; encoding: 'base64' }
  | { url: string; timeoutMs?: number; maxBytes?: number }
  | File

export interface AddMediaInput {
  /** Who owns this media. `{ type: 'User', id: 42 }` */
  model: OwnerRef
  /**
   * The file. Accepts:
   *   - raw `Buffer` / `Uint8Array` (must also pass `fileName`)
   *   - Node `Readable` stream (must also pass `fileName`)
   *   - `{ path: '/tmp/foo.png' }` (local filesystem)
   *   - Multer's `Express.Multer.File` shape (`{ buffer, originalname, mimetype }`)
   *   - Fastify-multipart's `{ stream, filename, mimetype }`
   *   - `{ data, filename, encoding: 'base64' }`
   *   - `{ url: 'https://…' }` (remote fetch)
   *   - Web `File` (from Fetch `FormData`)
   */
  file: AttachFile
  /** Required when `file` is a raw Buffer / stream without a filename. */
  fileName?: string
  collection?: string
  name?: string
  customProperties?: Record<string, unknown>
  order?: number
  disk?: string
  preservingOriginal?: boolean
}

export interface MediaUrlOptions {
  /**
   * If the requested conversion hasn't been generated yet (e.g. still queued),
   * return the original instead of a URL that would 404. Default: `true`.
   * Pass `false` to always return the conversion URL even when it doesn't exist yet.
   */
  fallback?: boolean
}

export interface MediaStreamOptions extends MediaUrlOptions {
  range?: { start: number; end?: number }
}

/**
 * The programmatic surface of a `mediable()` instance. Everything is
 * library-as-functions — call these from your own route handlers, controllers,
 * queue workers, or CLI scripts. No HTTP layer.
 */
export interface MediaClient {
  // ---- Fluent attach (chainable) ----
  for(modelType: string, modelId: string | number): MediaAttacher

  // ---- One-line attach (common case) ----
  addMedia(input: AddMediaInput): Promise<MediaRecord>

  // ---- Raw attach (advanced / ingestion scripts) ----
  attach(input: AttachInput): Promise<MediaRecord>

  // ---- Direct-to-storage uploads (S3 / R2 / MinIO / B2) ----
  /**
   * Reserve a media slot + issue a presigned URL the client PUTs to directly.
   * Requires the target disk to support presigned uploads (S3/R2/MinIO/B2 do;
   * LocalStorage does not — use `addMedia()` for local).
   *
   * Follow-up call: `confirmUpload({ uuid })` once the client PUT succeeds.
   */
  presignUpload(input: PresignUploadInput): Promise<PresignUploadResult>

  /**
   * Confirm a direct-to-storage upload by its uuid. Verifies the object
   * exists in the bucket, re-validates size + mime type against the
   * collection, flips the record to `status='ready'`, and kicks off
   * conversions (inline + queued). Idempotent on already-ready records.
   */
  confirmUpload(input: ConfirmUploadInput): Promise<MediaRecord>

  // ---- Retrieval ----
  get(id: string): Promise<MediaRecord | null>
  getByUuid(uuid: string): Promise<MediaRecord | null>
  getFirst(owner: OwnerRef, collection?: string): Promise<MediaRecord | null>
  list(owner: OwnerRef, collection?: string): Promise<MediaRecord[]>

  // ---- URLs ----
  /** Public URL if the disk has one (S3 / CDN / local publicUrlBase), else null.
   *  If `conversion` is requested but hasn't been generated yet, falls back to the
   *  original by default. Pass `{ fallback: false }` to opt out. */
  url(
    media: MediaRecord | string,
    conversion?: string,
    options?: MediaUrlOptions,
  ): Promise<string | null>
  /** Signed / expiring URL. Local driver produces a token you verify via verifySignedToken.
   *  Falls back to the original when the requested conversion isn't ready (same rule as `url`). */
  temporaryUrl(
    media: MediaRecord | string,
    expiresInSeconds: number,
    conversion?: string,
    options?: MediaUrlOptions,
  ): Promise<string>

  // ---- Byte access (stream into your own response) ----
  /** Falls back to the original when the requested conversion isn't ready. */
  stream(
    media: MediaRecord | string,
    conversion?: string,
    options?: MediaStreamOptions,
  ): Promise<{ body: Readable; contentType: string; contentLength?: number; etag?: string }>

  // ---- Signed token verification (for building a private-serve route yourself) ----
  verifySignedToken(token: string): Promise<{ media: MediaRecord; key: string } | null>

  // ---- Mutations ----
  delete(id: string): Promise<void>
  reorder(ids: string[]): Promise<void>
  updateCustomProperties(id: string, props: Record<string, unknown>): Promise<MediaRecord>
  regenerateConversions(id: string): Promise<void>
}

export function createClient(config: ResolvedConfig, repo: MediaRepository): MediaClient {
  const resolveMedia = async (m: MediaRecord | string): Promise<MediaRecord> => {
    if (typeof m !== 'string') return m
    const found = (await repo.findById(m)) ?? (await repo.findByUuid(m))
    if (!found) throw new Error(`media not found: ${m}`)
    return found
  }

  const client: MediaClient = {
    for(modelType, modelId) {
      return new MediaAttacher(
        { type: modelType, id: modelId },
        { attach: (input) => performAttach(input, config, repo) },
      )
    },

    async addMedia(input) {
      const source = toAttachSource(input.file, input.fileName)
      return performAttach(
        {
          owner: input.model,
          source,
          collection: input.collection,
          disk: input.disk,
          name: input.name,
          fileName: input.fileName,
          customProperties: input.customProperties,
          order: input.order,
          preservingOriginal: input.preservingOriginal,
        },
        config,
        repo,
      )
    },

    attach(input) {
      return performAttach(input, config, repo)
    },

    presignUpload(input) {
      return performPresignUpload(input, config, repo)
    },

    confirmUpload(input) {
      return performConfirmUpload(input, config, repo)
    },

    get(id) {
      return repo.findById(id)
    },
    getByUuid(uuid) {
      return repo.findByUuid(uuid)
    },
    getFirst(owner, collection) {
      return repo.findFirst(owner, collection)
    },
    list(owner, collection) {
      return repo.findByOwner(owner, collection)
    },

    async url(media, conversion, options) {
      const m = await resolveMedia(media)
      const effective = resolveEffectiveConversion(m, conversion, options?.fallback ?? true)
      const { disk, key } = resolveDiskAndKey(m, effective, config)
      return disk.url(key)
    },

    async temporaryUrl(media, expiresInSeconds, conversion, options) {
      const m = await resolveMedia(media)
      const effective = resolveEffectiveConversion(m, conversion, options?.fallback ?? true)
      const { disk, key } = resolveDiskAndKey(m, effective, config)
      return disk.temporaryUrl(key, expiresInSeconds)
    },

    async stream(media, conversion, options) {
      const m = await resolveMedia(media)
      const effective = resolveEffectiveConversion(m, conversion, options?.fallback ?? true)
      const { disk, key } = resolveDiskAndKey(m, effective, config)
      const result = await disk.stream(key, options?.range)
      return mapStream(m, effective, config, result)
    },

    async verifySignedToken(token) {
      const verified = verifyLocalSignedToken(token, config.secret)
      if (!verified) return null
      const mediaId = verified.key.split('/')[0]
      if (!mediaId) return null
      const found = await repo.findById(mediaId)
      if (!found) return null
      return { media: found, key: verified.key }
    },

    async delete(id) {
      const media = await repo.findById(id)
      if (!media) return
      await config.events.emit('onMediaDeleting', { media })
      await deleteAllFiles(media, config)
      await repo.delete(id)
      await config.events.emit('onMediaDeleted', { media })
    },

    async reorder(ids) {
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]
        if (!id) continue
        await repo.update(id, { orderColumn: i })
      }
    },

    async updateCustomProperties(id, props) {
      const media = await repo.findById(id)
      if (!media) throw new Error(`media not found: ${id}`)
      const merged = { ...(media.customProperties as any), ...props }
      return repo.update(id, { customProperties: merged as any })
    },

    async regenerateConversions(id) {
      const media = await repo.findById(id)
      if (!media) throw new Error(`media not found: ${id}`)
      const owner = config.owners.byType.get(media.modelType) ?? config.owners.wildcard
      if (!owner) return
      const collection = owner.collections.get(media.collectionName)
      if (!collection) return
      const plans = [
        ...collection.conversions,
        ...owner.sharedConversions
          .filter((s) => s.performOn === null || s.performOn.includes(media.collectionName))
          .map((s) => s.plan),
      ]
      for (const plan of plans) {
        if (plan.queued) {
          await config.queue.enqueue('mediable:generate-conversion', {
            mediaId: id,
            conversionName: plan.name,
          })
        } else {
          await executeOne({ media, plan, config, repo })
        }
      }
    },
  }

  return client
}

function toAttachSource(file: AttachFile, fileName?: string): AttachSource {
  // Buffer / Uint8Array
  if (Buffer.isBuffer(file) || file instanceof Uint8Array) {
    if (!fileName) {
      throw new Error("addMedia: when passing a raw Buffer, you must also pass `fileName`.")
    }
    return {
      kind: 'buffer',
      data: Buffer.isBuffer(file) ? file : Buffer.from(file),
      filename: fileName,
    }
  }

  // Node Readable stream
  if (isReadableStream(file)) {
    if (!fileName) {
      throw new Error("addMedia: when passing a Readable stream, you must also pass `fileName`.")
    }
    return { kind: 'stream', stream: file, filename: fileName }
  }

  // Fetch API File (has arrayBuffer())
  if (typeof File !== 'undefined' && file instanceof File) {
    return {
      kind: 'fetch-file',
      file,
      filename: fileName ?? file.name,
    }
  }

  // Objects
  if (typeof file === 'object' && file !== null) {
    if ('path' in file && typeof file.path === 'string') {
      return { kind: 'file', path: file.path }
    }
    if ('buffer' in file && Buffer.isBuffer(file.buffer)) {
      // multer-style
      const mf = file as {
        buffer: Buffer
        originalname: string
        mimetype?: string
        size?: number
      }
      return {
        kind: 'buffer',
        data: mf.buffer,
        filename: fileName ?? mf.originalname,
        contentType: mf.mimetype,
      }
    }
    if ('stream' in file && isReadableStream((file as any).stream)) {
      const mf = file as {
        stream: Readable
        filename: string
        mimetype?: string
        size?: number
      }
      return {
        kind: 'stream',
        stream: mf.stream,
        filename: fileName ?? mf.filename,
        contentType: mf.mimetype,
        size: mf.size,
      }
    }
    if ('data' in file && 'encoding' in file && file.encoding === 'base64') {
      return { kind: 'base64', data: file.data, filename: fileName ?? file.filename }
    }
    if ('url' in file && typeof file.url === 'string') {
      return {
        kind: 'url',
        url: file.url,
        timeoutMs: file.timeoutMs,
        maxBytes: file.maxBytes,
      }
    }
  }

  throw new Error(
    'addMedia: unrecognized file shape. Pass a Buffer, Readable, path object, multer File, Fastify file, base64 object, url object, or Fetch File.',
  )
}

function isReadableStream(x: unknown): x is Readable {
  return (
    !!x &&
    typeof x === 'object' &&
    typeof (x as any).pipe === 'function' &&
    typeof (x as any).on === 'function'
  )
}

/**
 * Decide whether to use the requested conversion or fall back to the original.
 * Returns the effective conversion name (or undefined to indicate "use original").
 */
function resolveEffectiveConversion(
  media: MediaRecord,
  conversion: string | undefined,
  fallback: boolean,
): string | undefined {
  if (!conversion) return undefined
  if (!fallback) return conversion
  const ready = media.generatedConversions[conversion] === true
  return ready ? conversion : undefined
}

function resolveDiskAndKey(
  media: MediaRecord,
  conversion: string | undefined,
  config: ResolvedConfig,
): { disk: ReturnType<typeof pickDisk>; key: string } {
  const ctx = buildPathContext({
    mediaId: media.id,
    uuid: media.uuid,
    modelType: media.modelType,
    modelId: media.modelId,
    collectionName: media.collectionName,
    fileName: media.fileName,
  })
  if (!conversion) {
    const disk = pickDisk(config, media.disk)
    return { disk, key: config.pathGenerator.original(ctx) }
  }
  const disk = pickDisk(config, media.conversionsDisk || media.disk)
  const ext = inferConversionExt(media, conversion, config)
  return { disk, key: config.pathGenerator.conversion(ctx, conversion, ext) }
}

function pickDisk(config: ResolvedConfig, name: string) {
  const disk = config.storage.disks[name]
  if (!disk) throw new Error(`storage disk not found: ${name}`)
  return disk
}

function inferConversionExt(
  media: MediaRecord,
  conversionName: string,
  config: ResolvedConfig,
): string {
  const owner = config.owners.byType.get(media.modelType) ?? config.owners.wildcard
  if (owner) {
    const collection = owner.collections.get(media.collectionName)
    const plan =
      collection?.conversions.find((p) => p.name === conversionName) ??
      owner.sharedConversions.find((s) => s.plan.name === conversionName)?.plan
    if (plan) return plan.outputExt
  }
  return media.fileName.split('.').pop() ?? 'bin'
}

function mapStream(
  media: MediaRecord,
  conversion: string | undefined,
  config: ResolvedConfig,
  result: StreamResult,
) {
  const contentType = conversion
    ? inferConversionMime(media, conversion, config)
    : (result.contentType ?? media.mimeType)
  return {
    body: result.body,
    contentType,
    contentLength: result.contentLength,
    etag: result.etag,
  }
}

function inferConversionMime(
  media: MediaRecord,
  conversion: string,
  config: ResolvedConfig,
): string {
  const ext = inferConversionExt(media, conversion, config)
  const m: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    avif: 'image/avif',
  }
  return m[ext] ?? 'application/octet-stream'
}

async function deleteAllFiles(media: MediaRecord, config: ResolvedConfig): Promise<void> {
  const ctx = buildPathContext({
    mediaId: media.id,
    uuid: media.uuid,
    modelType: media.modelType,
    modelId: media.modelId,
    collectionName: media.collectionName,
    fileName: media.fileName,
  })
  const originalDisk = config.storage.disks[media.disk]
  if (originalDisk) {
    await originalDisk.delete(config.pathGenerator.original(ctx)).catch(() => {})
  }
  const convDisk = config.storage.disks[media.conversionsDisk] ?? originalDisk
  if (convDisk) {
    for (const [name, done] of Object.entries(media.generatedConversions)) {
      if (!done) continue
      const ext = inferConversionExt(media, name, config)
      await convDisk.delete(config.pathGenerator.conversion(ctx, name, ext)).catch(() => {})
    }
  }
}

export { MediaAttacher, performAttach } from './attacher'
export type { AttachInput, AttachSource } from './attacher'
export { performConfirmUpload, performPresignUpload } from './presign'
export type {
  ConfirmUploadInput,
  PresignUploadInput,
  PresignUploadResult,
} from './presign'
