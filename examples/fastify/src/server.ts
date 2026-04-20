import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { media } from './media.js'
import { demoHtml } from './demo-html.js'

mkdirSync('./storage/media', { recursive: true })

const app = Fastify({ logger: { level: 'info' } })

await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } })
await app.register(fastifyStatic, {
  root: resolve(process.cwd(), 'storage/media'),
  prefix: '/media/',
})

// ─────────── Server-proxied upload (multipart) ───────────
app.post('/users/:id/avatar', async (req, reply) => {
  const { id } = req.params as { id: string }
  const data = await req.file()
  if (!data) return reply.code(400).send({ error: 'file required' })

  const record = await media.addMedia({
    model: { type: 'User', id },
    file: { stream: data.file, filename: data.filename, mimetype: data.mimetype },
    collection: 'avatars',
    customProperties: { uploadedFrom: req.ip },
  })
  return reply.code(201).send(record)
})

// ─────────── Direct-to-storage upload ───────────
app.post('/api/presign-upload', async (req) => {
  const body = req.body as {
    userId?: string
    fileName: string
    mimeType?: string
    size?: number
    collection?: string
  }
  return media.presignUpload({
    model: { type: 'User', id: body.userId ?? 'u1' },
    fileName: body.fileName,
    mimeType: body.mimeType,
    size: body.size,
    collection: body.collection ?? 'avatars',
    expiresInSeconds: 600,
  })
})

app.post('/api/confirm-upload', async (req, reply) => {
  const { uuid } = req.body as { uuid: string }
  const record = await media.confirmUpload({ uuid })
  return reply.code(201).send(record)
})

// ─────────── Retrieval / delete ───────────
app.get('/users/:id/avatar', async (req, reply) => {
  const { id } = req.params as { id: string }
  const record = await media.getFirst({ type: 'User', id }, 'avatars')
  if (!record) return reply.code(404).send({ error: 'no avatar' })
  return {
    record,
    thumbUrl: await media.url(record, 'thumb'),
    previewUrl: await media.url(record, 'preview'),
  }
})

app.get('/products/:id/gallery', async (req) => {
  const { id } = req.params as { id: string }
  return media.list({ type: 'Product', id }, 'gallery')
})

app.delete('/media/:id', async (req, reply) => {
  const { id } = req.params as { id: string }
  const record = await media.get(id)
  if (!record) return reply.code(404).send()
  await media.delete(record.id)
  return reply.code(204).send()
})

app.get('/signed/:token', async (req, reply) => {
  const { token } = req.params as { token: string }
  const verified = await media.verifySignedToken(token)
  if (!verified) return reply.code(403).send()
  const { body, contentType, contentLength } = await media.stream(verified.media)
  reply.header('content-type', contentType)
  if (contentLength) reply.header('content-length', String(contentLength))
  return reply.send(body)
})

app.get('/', async (_req, reply) => {
  reply.type('text/html')
  return demoHtml('Fastify')
})

const port = Number(process.env.PORT ?? 3000)
await app.listen({ port })
console.log(`mediable example (fastify) listening on http://localhost:${port}`)
