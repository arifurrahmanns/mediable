import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import sharp from 'sharp'
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { mediable, LocalStorage, type MediableInstance } from './index'
import { sharpProcessor } from './sharp'

const SECRET = 'test-secret-at-least-16-chars-long'
const FIXTURE_PATH = resolve('tests/fixtures/image.jpg')

let tmpRoot: string
let media: MediableInstance
let imageJpg: Buffer

beforeAll(async () => {
  if (!existsSync(FIXTURE_PATH)) {
    mkdirSync(dirname(FIXTURE_PATH), { recursive: true })
    const generated = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 220, g: 100, b: 60 },
      },
    })
      .jpeg({ quality: 85 })
      .toBuffer()
    writeFileSync(FIXTURE_PATH, generated)
  }
  imageJpg = readFileSync(FIXTURE_PATH)
})

beforeEach(() => {
  tmpRoot = mkdtempSync()
  media = mediable({
    secret: SECRET,
    database: { provider: 'sqlite', connection: { filename: ':memory:' }, autoMigrate: true },
    storage: {
      default: 'local',
      disks: { local: LocalStorage({ root: join(tmpRoot, 'storage') }) },
    },
    image: sharpProcessor(),
    owners: {
      User: ({ collection }) => {
        collection('avatars')
          .singleFile()
          .accepts('image/*')
          .maxSize('5MB')
          .convert('thumb', (i) => i.width(96).height(96).fit('cover').format('webp'))
        collection('gallery').accepts('image/*').maxFiles(10)
      },
    },
  })
})

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

function mkdtempSync(): string {
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
  return mkdtempSync(join(tmpdir(), 'mediable-'))
}

describe('addMedia (one-liner)', () => {
  test('accepts a multer-style file object and runs the inline conversion via Sharp', async () => {
    const record = await media.addMedia({
      model: { type: 'User', id: 'u1' },
      file: {
        buffer: imageJpg,
        originalname: 'image.jpg',
        mimetype: 'image/jpeg',
      },
      collection: 'avatars',
      customProperties: { alt: 'hello' },
    })
    expect(record.fileName).toBe('image.jpg')
    expect(record.mimeType).toBe('image/jpeg')
    expect(record.status).toBe('ready')
    expect(record.customProperties).toEqual({ alt: 'hello' })
    expect(record.generatedConversions).toEqual({ thumb: true })
    expect(record.optimizedAt).not.toBeNull()

    const originalBytes = readFileSync(join(tmpRoot, 'storage', `${record.id}/image.jpg`))
    expect(originalBytes.length).toBe(record.size)

    const thumbBytes = readFileSync(join(tmpRoot, 'storage', `${record.id}/conversions/thumb.webp`))
    expect(thumbBytes.length).toBeGreaterThan(0)
  })

  test('accepts a raw Buffer + fileName', async () => {
    const record = await media.addMedia({
      model: { type: 'User', id: 'u2' },
      file: imageJpg,
      fileName: 'image.jpg',
      collection: 'avatars',
    })
    expect(record.fileName).toBe('image.jpg')
  })

  test('accepts a Readable stream', async () => {
    const stream = Readable.from([imageJpg])
    const record = await media.addMedia({
      model: { type: 'User', id: 'u3' },
      file: stream,
      fileName: 'image.jpg',
      collection: 'avatars',
    })
    expect(record.fileName).toBe('image.jpg')
  })

  test('accepts a Fetch API File (FormData-style)', async () => {
    const blob = new Blob([imageJpg], { type: 'image/jpeg' })
    const fetchFile = new File([blob], 'image.jpg', { type: 'image/jpeg' })
    const record = await media.addMedia({
      model: { type: 'User', id: 'u4' },
      file: fetchFile,
      collection: 'avatars',
    })
    expect(record.fileName).toBe('image.jpg')
    expect(record.mimeType).toBe('image/jpeg')
  })

  test('rejects raw Buffer without fileName', async () => {
    await expect(
      media.addMedia({
        model: { type: 'User', id: 'u5' },
        file: imageJpg,
        collection: 'avatars',
      }),
    ).rejects.toThrow(/fileName/)
  })
})

describe('fluent for().addFromX() chain', () => {
  test('addFromBuffer', async () => {
    const record = await media
      .for('User', 'u6')
      .addFromBuffer(imageJpg, 'image.jpg')
      .toCollection('avatars')
      .save()
    expect(record.fileName).toBe('image.jpg')
  })
})

describe('retrieval', () => {
  test('getFirst / list / get', async () => {
    const a = await media.addMedia({
      model: { type: 'User', id: 'u7' },
      file: { buffer: imageJpg, originalname: 'a.jpg' },
      collection: 'gallery',
    })
    const b = await media.addMedia({
      model: { type: 'User', id: 'u7' },
      file: { buffer: imageJpg, originalname: 'b.jpg' },
      collection: 'gallery',
    })
    expect(a.orderColumn).toBe(0)
    expect(b.orderColumn).toBe(1)

    const first = await media.getFirst({ type: 'User', id: 'u7' }, 'gallery')
    expect(first?.fileName).toBe('a.jpg')

    const list = await media.list({ type: 'User', id: 'u7' }, 'gallery')
    expect(list.map((m) => m.fileName)).toEqual(['a.jpg', 'b.jpg'])

    const byId = await media.get(a.id)
    expect(byId?.id).toBe(a.id)
    const byUuid = await media.getByUuid(a.uuid)
    expect(byUuid?.id).toBe(a.id)
  })
})

describe('singleFile replacement', () => {
  test('second upload replaces first', async () => {
    const first = await media.addMedia({
      model: { type: 'User', id: 'u8' },
      file: { buffer: imageJpg, originalname: 'one.jpg' },
      collection: 'avatars',
    })
    const second = await media.addMedia({
      model: { type: 'User', id: 'u8' },
      file: { buffer: imageJpg, originalname: 'two.jpg' },
      collection: 'avatars',
    })
    expect(second.id).not.toBe(first.id)
    const list = await media.list({ type: 'User', id: 'u8' }, 'avatars')
    expect(list).toHaveLength(1)
    expect(list[0]!.fileName).toBe('two.jpg')
  })
})

describe('validation', () => {
  test('rejects disallowed mime types', async () => {
    await expect(
      media.addMedia({
        model: { type: 'User', id: 'u9' },
        file: { buffer: Buffer.from('hello world'), originalname: 'doc.txt' },
        collection: 'avatars',
      }),
    ).rejects.toThrow(/not accepted/)
  })

  test('rejects files exceeding maxSize', async () => {
    const big = Buffer.concat([imageJpg, Buffer.alloc(6 * 1024 * 1024, 0)])
    await expect(
      media.addMedia({
        model: { type: 'User', id: 'u10' },
        file: { buffer: big, originalname: 'big.jpg' },
        collection: 'avatars',
      }),
    ).rejects.toThrow(/exceeds max/)
  })
})

describe('stream()', () => {
  test('original bytes + correct content-type', async () => {
    const record = await media.addMedia({
      model: { type: 'User', id: 'u11' },
      file: { buffer: imageJpg, originalname: 'image.jpg' },
      collection: 'avatars',
    })
    const { body, contentType } = await media.stream(record)
    expect(contentType).toBe('image/jpeg')
    const chunks: Buffer[] = []
    for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    expect(Buffer.concat(chunks).length).toBe(record.size)
  })

  test('thumb conversion streams image/webp bytes', async () => {
    const record = await media.addMedia({
      model: { type: 'User', id: 'u11b' },
      file: { buffer: imageJpg, originalname: 'image.jpg' },
      collection: 'avatars',
    })
    const { body, contentType } = await media.stream(record, 'thumb')
    expect(contentType).toBe('image/webp')
    const chunks: Buffer[] = []
    for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    expect(Buffer.concat(chunks).length).toBeGreaterThan(0)
  })
})

describe('signed tokens', () => {
  test('temporaryUrl + verifySignedToken round-trip', async () => {
    const record = await media.addMedia({
      model: { type: 'User', id: 'u12' },
      file: { buffer: imageJpg, originalname: 'image.jpg' },
      collection: 'avatars',
    })
    const url = await media.temporaryUrl(record, 300)
    const token = url.split('/').pop()!
    const verified = await media.verifySignedToken(token)
    expect(verified?.media.id).toBe(record.id)
  })

  test('tampered token is rejected', async () => {
    const record = await media.addMedia({
      model: { type: 'User', id: 'u13' },
      file: { buffer: imageJpg, originalname: 'image.jpg' },
      collection: 'avatars',
    })
    const url = await media.temporaryUrl(record, 300)
    const token = url.split('/').pop()!
    const tampered = token.slice(0, -2) + 'aa'
    const verified = await media.verifySignedToken(tampered)
    expect(verified).toBeNull()
  })
})

describe('delete', () => {
  test('removes record + original + conversions', async () => {
    const record = await media.addMedia({
      model: { type: 'User', id: 'u14' },
      file: { buffer: imageJpg, originalname: 'image.jpg' },
      collection: 'avatars',
    })
    await media.delete(record.id)
    expect(await media.get(record.id)).toBeNull()
    expect(() => readFileSync(join(tmpRoot, 'storage', `${record.id}/image.jpg`))).toThrow()
    expect(() =>
      readFileSync(join(tmpRoot, 'storage', `${record.id}/conversions/thumb.webp`)),
    ).toThrow()
  })
})

describe('conversion priority + queued', () => {
  test('collection.convert accepts { queued, priority } and forwards priority on enqueue', async () => {
    const captured: Array<{ name: string; priority?: number }> = []

    const instance = mediable({
      secret: SECRET,
      database: { provider: 'sqlite', connection: { filename: ':memory:' }, autoMigrate: true },
      storage: {
        default: 'local',
        disks: { local: LocalStorage({ root: join(tmpRoot, 'p-storage') }) },
      },
      queue: {
        async enqueue(_job, payload: any, opts) {
          captured.push({ name: payload.conversionName, priority: opts?.priority })
        },
        process() {},
        async close() {},
      },
      owners: {
        User: ({ collection, convert }) => {
          collection('avatars')
            .accepts('image/*')
            .convert('fast', (i) => i.width(96).format('webp'), { queued: true })
            .convert('bg', (i) => i.width(1920).format('webp'), { queued: true, priority: 10 })

          convert('card', (i) => i.width(640).format('webp'))
            .performOn('avatars')
            .queued()
            .priority(1)
        },
      },
    })

    await instance.addMedia({
      model: { type: 'User', id: 'pu1' },
      file: { buffer: imageJpg, originalname: 'image.jpg' },
      collection: 'avatars',
    })

    const byName = new Map(captured.map((c) => [c.name, c]))
    expect(byName.get('fast')?.priority).toBeUndefined()
    expect(byName.get('bg')?.priority).toBe(10)
    expect(byName.get('card')?.priority).toBe(1)
  })
})

describe('fallback when conversion not yet generated', () => {
  test('stream(media, "notgenerated") falls back to original', async () => {
    const record = await media.addMedia({
      model: { type: 'User', id: 'fb1' },
      file: { buffer: imageJpg, originalname: 'image.jpg' },
      collection: 'avatars',
    })

    // 'preview' isn't configured on this collection, so it's not generated.
    const result = await media.stream(record, 'preview')
    expect(result.contentType).toBe('image/jpeg') // original mime → fell back to original
    const chunks: Buffer[] = []
    for await (const chunk of result.body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    expect(Buffer.concat(chunks).length).toBe(record.size)
  })

  test('stream(media, "preview", { fallback: false }) throws when missing', async () => {
    const record = await media.addMedia({
      model: { type: 'User', id: 'fb2' },
      file: { buffer: imageJpg, originalname: 'image.jpg' },
      collection: 'avatars',
    })
    await expect(media.stream(record, 'preview', { fallback: false })).rejects.toThrow()
  })

  test('temporaryUrl signs original when conversion not ready; opt-out signs conversion key', async () => {
    const record = await media.addMedia({
      model: { type: 'User', id: 'fb3' },
      file: { buffer: imageJpg, originalname: 'image.jpg' },
      collection: 'avatars',
    })
    const withFallback = await media.temporaryUrl(record, 60, 'preview')
    const noFallback = await media.temporaryUrl(record, 60, 'preview', { fallback: false })
    expect(withFallback).not.toBe(noFallback)
  })
})

describe('reorder', () => {
  test('updates orderColumn according to input order', async () => {
    const a = await media.addMedia({
      model: { type: 'User', id: 'u15' },
      file: { buffer: imageJpg, originalname: 'a.jpg' },
      collection: 'gallery',
    })
    const b = await media.addMedia({
      model: { type: 'User', id: 'u15' },
      file: { buffer: imageJpg, originalname: 'b.jpg' },
      collection: 'gallery',
    })
    await media.reorder([b.id, a.id])
    const list = await media.list({ type: 'User', id: 'u15' }, 'gallery')
    expect(list.map((m) => m.fileName)).toEqual(['b.jpg', 'a.jpg'])
  })
})
