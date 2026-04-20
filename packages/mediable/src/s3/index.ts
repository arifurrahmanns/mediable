import { createRequire } from 'node:module'
import { Readable } from 'node:stream'
import type {
  PresignUploadOptions,
  PresignUploadResult,
  PutOptions,
  PutResult,
  StorageDriver,
  StreamRange,
  StreamResult,
} from '../storage/types'

declare const __filename: string | undefined
const requireShim = createRequire(
  typeof __filename !== 'undefined' ? __filename : import.meta.url,
)

/**
 * S3-compatible storage driver. Works with:
 *   - AWS S3 (omit `endpoint`)
 *   - Cloudflare R2 (`endpoint: 'https://<account>.r2.cloudflarestorage.com'`, `region: 'auto'`)
 *   - MinIO         (`endpoint: 'http://localhost:9000'`, `forcePathStyle: true`)
 *   - Backblaze B2  (`endpoint: 'https://s3.<region>.backblazeb2.com'`)
 *   - DigitalOcean Spaces, Wasabi, iDrive e2, etc.
 */
export interface S3StorageOptions {
  /** Bucket name. */
  bucket: string
  /** AWS region (e.g. 'us-east-1'). Use 'auto' for R2. */
  region: string
  /** Custom endpoint for non-AWS providers (R2 / MinIO / B2 / Spaces / Wasabi). */
  endpoint?: string
  credentials?: {
    accessKeyId: string
    secretAccessKey: string
    sessionToken?: string
  }
  /** Force path-style addressing (required for MinIO, optional elsewhere). */
  forcePathStyle?: boolean
  /**
   * Base public URL prefix for `url()`. If set, `url()` returns `${publicUrlBase}/${key}`.
   * If omitted, `url()` returns `null` and mediable streams through your server via `media.stream()`.
   *
   * Examples:
   *   AWS with public-read bucket: `'https://my-bucket.s3.us-east-1.amazonaws.com'`
   *   CloudFront in front of S3:   `'https://cdn.example.com'`
   *   R2 public bucket:            `'https://pub-<hash>.r2.dev'`
   */
  publicUrlBase?: string
  /** Optional ACL applied on every `put()` (e.g. 'public-read'). Default: none. */
  acl?: 'private' | 'public-read' | 'public-read-write' | 'authenticated-read'
  /** Optional key prefix applied to every key (e.g. 'uploads/'). */
  keyPrefix?: string
  /** Cache-Control applied to every `put()`. Override per-object via `put(..., { cacheControl })`. */
  defaultCacheControl?: string
  /**
   * Optional existing S3Client instance. Advanced use — lets you share a client
   * with other parts of your app, configure retry strategies, custom signers, etc.
   * When provided, `region`, `endpoint`, `credentials`, `forcePathStyle` are ignored.
   */
  client?: unknown
}

export interface S3StorageDriver extends StorageDriver {
  readonly name: 's3'
  /** Access the underlying `@aws-sdk/client-s3` `S3Client` for escape-hatch operations. */
  readonly client: unknown
  /** The bucket this driver writes to. */
  readonly bucket: string
}

/**
 * Create an S3-compatible storage driver.
 *
 * ```ts
 * import { s3Storage } from 'mediable/s3'
 *
 * storage: {
 *   default: 's3',
 *   disks: {
 *     s3: s3Storage({
 *       bucket: 'my-app-media',
 *       region: 'us-east-1',
 *       credentials: {
 *         accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
 *         secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
 *       },
 *     }),
 *   },
 * }
 * ```
 */
export function s3Storage(opts: S3StorageOptions): S3StorageDriver {
  // Lazy-load AWS SDK so users who don't use S3 never pay the cost.
  // `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` are regular deps
  // of the `mediable` package, so they're always installed — but the import
  // only runs when someone actually calls `s3Storage()`.
  const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    CopyObjectCommand,
    NotFound,
    NoSuchKey,
  } = requireShim('@aws-sdk/client-s3') as typeof import('@aws-sdk/client-s3')
  const { getSignedUrl } =
    requireShim(
      '@aws-sdk/s3-request-presigner',
    ) as typeof import('@aws-sdk/s3-request-presigner')

  const client =
    (opts.client as InstanceType<typeof S3Client> | undefined) ??
    new S3Client({
      region: opts.region,
      endpoint: opts.endpoint,
      forcePathStyle: opts.forcePathStyle,
      credentials: opts.credentials,
    })

  const publicUrlBase = opts.publicUrlBase?.replace(/\/$/, '')
  const keyPrefix = opts.keyPrefix?.replace(/^\/+|\/+$/g, '')

  const prefix = (key: string): string => {
    assertSafeKey(key)
    return keyPrefix ? `${keyPrefix}/${key}` : key
  }

  const put = async (
    key: string,
    body: Readable | Buffer | Uint8Array,
    putOpts?: PutOptions,
  ): Promise<PutResult> => {
    const fullKey = prefix(key)
    // AWS SDK needs the full body length upfront or a stream with known length.
    // For Readable streams we buffer to compute size (mediable upload sizes are
    // bounded by collection maxSize, so this is safe).
    const data =
      Buffer.isBuffer(body) || body instanceof Uint8Array
        ? Buffer.isBuffer(body)
          ? body
          : Buffer.from(body)
        : await streamToBuffer(body)

    const response = await client.send(
      new PutObjectCommand({
        Bucket: opts.bucket,
        Key: fullKey,
        Body: data,
        ContentType: putOpts?.contentType,
        ContentLength: putOpts?.contentLength ?? data.byteLength,
        CacheControl: putOpts?.cacheControl ?? opts.defaultCacheControl,
        Metadata: putOpts?.metadata,
        ACL: opts.acl,
      }),
    )

    return {
      key,
      size: data.byteLength,
      etag: response.ETag?.replace(/"/g, ''),
    }
  }

  const get = async (key: string): Promise<Readable> => {
    const response = await client.send(
      new GetObjectCommand({ Bucket: opts.bucket, Key: prefix(key) }),
    )
    return bodyToReadable(response.Body)
  }

  const getBuffer = async (key: string): Promise<Buffer> => {
    const stream = await get(key)
    return streamToBuffer(stream)
  }

  const del = async (key: string): Promise<void> => {
    await client.send(new DeleteObjectCommand({ Bucket: opts.bucket, Key: prefix(key) }))
  }

  const deleteMany = async (keys: string[]): Promise<void> => {
    if (keys.length === 0) return
    // S3 DeleteObjects caps at 1000 keys per request.
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000)
      await client.send(
        new DeleteObjectsCommand({
          Bucket: opts.bucket,
          Delete: {
            Objects: chunk.map((k) => ({ Key: prefix(k) })),
            Quiet: true,
          },
        }),
      )
    }
  }

  const exists = async (key: string): Promise<boolean> => {
    try {
      await client.send(new HeadObjectCommand({ Bucket: opts.bucket, Key: prefix(key) }))
      return true
    } catch (err) {
      if (isNotFoundError(err, NotFound, NoSuchKey)) return false
      throw err
    }
  }

  const sizeOf = async (key: string): Promise<number> => {
    const response = await client.send(
      new HeadObjectCommand({ Bucket: opts.bucket, Key: prefix(key) }),
    )
    return response.ContentLength ?? 0
  }

  const url = (key: string): string | null => {
    if (!publicUrlBase) return null
    const full = prefix(key)
    return `${publicUrlBase}/${full.split('/').map(encodeURIComponent).join('/')}`
  }

  const temporaryUrl = async (key: string, expiresInSeconds: number): Promise<string> => {
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: opts.bucket, Key: prefix(key) }),
      { expiresIn: expiresInSeconds },
    )
  }

  const stream = async (key: string, range?: StreamRange): Promise<StreamResult> => {
    const rangeHeader = range
      ? `bytes=${range.start}-${range.end ?? ''}`
      : undefined
    const response = await client.send(
      new GetObjectCommand({
        Bucket: opts.bucket,
        Key: prefix(key),
        Range: rangeHeader,
      }),
    )
    return {
      body: bodyToReadable(response.Body),
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      etag: response.ETag?.replace(/"/g, ''),
    }
  }

  const copy = async (from: string, to: string): Promise<void> => {
    await client.send(
      new CopyObjectCommand({
        Bucket: opts.bucket,
        CopySource: `${opts.bucket}/${prefix(from)}`,
        Key: prefix(to),
        ACL: opts.acl,
      }),
    )
  }

  const move = async (from: string, to: string): Promise<void> => {
    await copy(from, to)
    await del(from)
  }

  const presignUpload = async (
    key: string,
    presignOpts: PresignUploadOptions,
  ): Promise<PresignUploadResult> => {
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: opts.bucket,
        Key: prefix(key),
        ContentType: presignOpts.contentType,
        Metadata: presignOpts.metadata,
        ACL: opts.acl,
      }),
      { expiresIn: presignOpts.expiresInSeconds },
    )
    return {
      uploadUrl,
      method: 'PUT',
      headers: presignOpts.contentType
        ? { 'content-type': presignOpts.contentType }
        : undefined,
      expires: new Date(Date.now() + presignOpts.expiresInSeconds * 1000),
    }
  }

  return {
    name: 's3',
    client,
    bucket: opts.bucket,
    put,
    get,
    getBuffer,
    delete: del,
    deleteMany,
    exists,
    size: sizeOf,
    url,
    temporaryUrl,
    stream,
    copy,
    move,
    presignUpload,
  }
}

// --- helpers -----------------------------------------------------------------

function assertSafeKey(key: string): void {
  if (!key) throw new Error('s3 key must be non-empty')
  if (key.includes('..')) throw new Error(`s3 key must not contain '..': ${key}`)
  if (key.startsWith('/')) throw new Error(`s3 key must not be absolute: ${key}`)
}

function isNotFoundError(
  err: unknown,
  NotFound: any,
  NoSuchKey: any,
): boolean {
  if (!err || typeof err !== 'object') return false
  if (NotFound && err instanceof NotFound) return true
  if (NoSuchKey && err instanceof NoSuchKey) return true
  const name = (err as { name?: string }).name
  const code = (err as { Code?: string; code?: string }).Code ?? (err as any).code
  const status =
    (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
  return (
    name === 'NotFound' ||
    name === 'NoSuchKey' ||
    code === 'NotFound' ||
    code === 'NoSuchKey' ||
    status === 404
  )
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function bodyToReadable(body: unknown): Readable {
  if (!body) {
    throw new Error('s3: empty response body')
  }
  // AWS SDK v3 in Node returns an IncomingMessage (Readable) as Body.
  if (body instanceof Readable) return body
  // In some environments Body comes back as a Web ReadableStream.
  if (typeof (body as any).getReader === 'function') {
    return Readable.fromWeb(body as any)
  }
  // Buffer / Uint8Array.
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    return Readable.from(body as any)
  }
  throw new Error('s3: unexpected Body type from S3 response')
}
