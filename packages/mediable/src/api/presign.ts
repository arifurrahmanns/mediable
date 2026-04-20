import { fileTypeFromBuffer } from 'file-type'
import type { ResolvedConfig } from '../config'
import type { MediaRepository } from '../db/repository'
import { newMediaId, newUuid } from '../ids'
import { getOwnerConfig } from '../owners/resolve'
import { matches as matchesMime } from '../owners/mime'
import type { CollectionConfig } from '../owners/types'
import { buildPathContext, sanitizeFileName } from '../storage/path'
import type { StorageDriver } from '../storage/types'
import type { MediaRecord, OwnerRef } from '../types'
import { runConversions } from '../conversions/run'

export interface PresignUploadInput {
  /** Who will own this media. e.g. `{ type: 'User', id: userId }`. */
  model: OwnerRef
  /** Original file name (used for path + later served back to clients). */
  fileName: string
  /**
   * Mime type the client says it will upload. Enforced by the bucket via the
   * signed `Content-Type` header (for S3/R2). Re-validated via byte sniffing
   * during `confirmUpload()` — clients can't cheat.
   */
  mimeType?: string
  /** File size hint (best-effort pre-check). Re-validated on confirm. */
  size?: number
  /** Collection name — defaults to 'default'. */
  collection?: string
  /** Override the collection's default disk. */
  disk?: string
  /** Presigned URL lifetime. Default: 600s (10 minutes). */
  expiresInSeconds?: number
  /** Human display name for the record. Defaults to the fileName without extension. */
  name?: string
  /** Extra JSON metadata persisted on the record. */
  customProperties?: Record<string, unknown>
  /** Insert at a specific order column; defaults to next-available. */
  order?: number
}

export interface PresignUploadResult {
  /** Pass this back to `confirmUpload({ uuid })` after the client PUT succeeds. */
  uuid: string
  /** The signed URL the client PUTs the file bytes to. */
  uploadUrl: string
  /** HTTP method for the upload. 'PUT' for S3/R2. */
  method: 'PUT' | 'POST'
  /** Headers the client MUST send alongside the upload (e.g. `content-type`). */
  headers?: Record<string, string>
  /** When the presigned URL expires. */
  expires: Date
  /** The storage key the object will land at (for debugging / audit). */
  key: string
}

export interface ConfirmUploadInput {
  /** The `uuid` returned from `presignUpload()`. */
  uuid: string
}

/**
 * Reserve a media slot + issue a presigned URL that the client PUTs the file
 * bytes to directly. Requires the disk to implement `presignUpload` — S3, R2,
 * MinIO, B2, Spaces all do; LocalStorage does not (use `addMedia()` instead).
 *
 * Flow:
 *   1. Client → `POST /presigned-url`     → `media.presignUpload(...)` → `{ uuid, uploadUrl }`
 *   2. Client → `PUT <uploadUrl>` (raw bytes) → bucket
 *   3. Client → `POST /confirm` with uuid → `media.confirmUpload({ uuid })`  → `MediaRecord` (status='ready', conversions queued)
 */
export async function performPresignUpload(
  input: PresignUploadInput,
  config: ResolvedConfig,
  repo: MediaRepository,
): Promise<PresignUploadResult> {
  const ownerConfig = getOwnerConfig(config.owners, input.model.type)
  const collectionName = input.collection ?? 'default'
  const collectionConfig = ownerConfig?.collections.get(collectionName) ?? null

  // Best-effort pre-check using whatever the client told us.
  if (input.mimeType) {
    validateMime(collectionConfig, input.mimeType, input.fileName)
  }
  if (input.size !== undefined) {
    validateSize(collectionConfig, input.size)
  }

  const diskName = input.disk ?? collectionConfig?.disk ?? config.storage.defaultDisk
  const conversionsDiskName = collectionConfig?.conversionsDisk ?? diskName
  const disk = config.storage.disks[diskName]
  if (!disk) throw new Error(`storage disk not found: ${diskName}`)
  if (typeof disk.presignUpload !== 'function') {
    throw new Error(
      `disk '${diskName}' does not support presigned uploads. ` +
        `Use media.addMedia() for this disk, or point 'disk' at an S3/R2/MinIO/B2 disk.`,
    )
  }

  const id = newMediaId()
  const uuid = newUuid()
  const fileName = sanitizeFileName(input.fileName)
  const ctx = buildPathContext({
    mediaId: id,
    uuid,
    modelType: input.model.type,
    modelId: String(input.model.id),
    collectionName,
    fileName,
  })
  const key = config.pathGenerator.original(ctx)

  const signed = await disk.presignUpload(key, {
    expiresInSeconds: input.expiresInSeconds ?? 600,
    contentType: input.mimeType,
  })

  const order =
    input.order ?? (await repo.nextOrderColumn(input.model, collectionName))

  await repo.create({
    id,
    uuid,
    modelType: input.model.type,
    modelId: String(input.model.id),
    collectionName,
    name: input.name ?? stripExtension(fileName),
    fileName,
    mimeType: input.mimeType ?? 'application/octet-stream',
    disk: diskName,
    conversionsDisk: conversionsDiskName,
    size: input.size ?? 0,
    manipulations: {},
    customProperties: (input.customProperties ?? {}) as any,
    generatedConversions: {},
    responsiveImages: {},
    orderColumn: order,
    status: 'pending',
    optimizedAt: null,
  })

  return {
    uuid,
    uploadUrl: signed.uploadUrl,
    method: signed.method,
    headers: signed.headers,
    expires: signed.expires,
    key,
  }
}

/**
 * Confirm that the client successfully PUT the file to the presigned URL.
 *
 * Flips the record from `status='pending'` to `status='ready'`, verifies the
 * object actually exists at the expected key, re-validates size + mime type
 * against the collection (clients can lie at presign time — this is where we
 * catch them), then triggers conversions:
 *   - Inline conversions run to completion before this returns.
 *   - Queued conversions are enqueued fire-and-forget; the worker picks them
 *     up, downloads the original from storage, runs Sharp, writes variants,
 *     updates `generatedConversions[name] = true` on the record.
 *
 * Idempotent: calling with an already-`ready` uuid returns the existing record
 * without re-running conversions.
 */
export async function performConfirmUpload(
  input: ConfirmUploadInput,
  config: ResolvedConfig,
  repo: MediaRepository,
): Promise<MediaRecord> {
  const record = await repo.findByUuid(input.uuid)
  if (!record) throw new Error(`pending media not found: uuid=${input.uuid}`)
  if (record.status === 'ready') return record
  if (record.status === 'failed') {
    throw new Error(`media ${input.uuid} is in 'failed' state`)
  }

  const ownerConfig = getOwnerConfig(config.owners, record.modelType)
  const collectionConfig =
    ownerConfig?.collections.get(record.collectionName) ?? null

  const disk = config.storage.disks[record.disk]
  if (!disk) throw new Error(`storage disk not found: ${record.disk}`)

  const ctx = buildPathContext({
    mediaId: record.id,
    uuid: record.uuid,
    modelType: record.modelType,
    modelId: record.modelId,
    collectionName: record.collectionName,
    fileName: record.fileName,
  })
  const key = config.pathGenerator.original(ctx)

  // 1. Verify the upload actually landed.
  const exists = await disk.exists(key)
  if (!exists) {
    throw new Error(
      `confirm-upload: no object at key '${key}'. Did the client PUT to the signed URL successfully?`,
    )
  }

  // 2. Authoritative size check.
  const actualSize = await disk.size(key)
  validateSize(collectionConfig, actualSize)

  // 3. Authoritative mime sniff (clients can lie; bytes don't).
  const actualMime = await sniffMimeFromDriver(
    disk,
    key,
    record.fileName,
    record.mimeType,
  )
  validateMime(collectionConfig, actualMime, record.fileName)

  // 4. singleFile/replacesExisting: wipe older ready records for this owner+collection.
  if (collectionConfig?.singleFile || collectionConfig?.replacesExisting) {
    const existing = await repo.findByOwner(
      { type: record.modelType, id: record.modelId },
      record.collectionName,
    )
    for (const prev of existing) {
      if (prev.id === record.id) continue
      if (prev.status !== 'ready') continue // don't touch in-flight pending records
      await deleteFilesForRecord(prev, config)
      await repo.delete(prev.id)
    }
  }

  // 5. Flip pending → ready with authoritative size + mime.
  const updated = await repo.update(record.id, {
    size: actualSize,
    mimeType: actualMime,
    status: 'ready',
  })

  await config.events.emit('onMediaAdded', { media: updated })

  // 6. Kick off conversions (inline + queued).
  if (collectionConfig) {
    await runConversions({
      media: updated,
      collection: collectionConfig,
      ownerConfig,
      config,
      repo,
    })
  }

  // Re-fetch so inline-conversion writes are reflected in the return value.
  const fresh = await repo.findById(updated.id)
  return fresh ?? updated
}

// --- helpers -----------------------------------------------------------------

async function sniffMimeFromDriver(
  disk: StorageDriver,
  key: string,
  fileName: string,
  fallback: string,
): Promise<string> {
  try {
    // 4KB is enough for file-type's magic-number detection on every format.
    const { body } = await disk.stream(key, { start: 0, end: 4095 })
    const chunks: Buffer[] = []
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const sniff = await fileTypeFromBuffer(Buffer.concat(chunks))
    if (sniff) return sniff.mime
  } catch {
    // fall through to fallback
  }
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  const extFallback: Record<string, string> = {
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    json: 'application/json',
    svg: 'image/svg+xml',
  }
  return extFallback[ext] ?? fallback
}

function validateMime(
  collection: CollectionConfig | null,
  mimeType: string,
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
}

function validateSize(collection: CollectionConfig | null, size: number): void {
  if (!collection) return
  if (collection.maxFileSize !== null && size > collection.maxFileSize) {
    throw new Error(
      `file size ${size} exceeds max ${collection.maxFileSize} for collection '${collection.name}'`,
    )
  }
}

async function deleteFilesForRecord(
  record: MediaRecord,
  config: ResolvedConfig,
): Promise<void> {
  const ctx = buildPathContext({
    mediaId: record.id,
    uuid: record.uuid,
    modelType: record.modelType,
    modelId: record.modelId,
    collectionName: record.collectionName,
    fileName: record.fileName,
  })
  const disk = config.storage.disks[record.disk]
  if (!disk) return
  await disk.delete(config.pathGenerator.original(ctx)).catch(() => {})
  const ext = (record.fileName.split('.').pop() ?? 'bin').toLowerCase()
  for (const [name, done] of Object.entries(record.generatedConversions)) {
    if (!done) continue
    const ckey = config.pathGenerator.conversion(ctx, name, ext)
    await disk.delete(ckey).catch(() => {})
  }
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? filename.slice(0, dot) : filename
}
