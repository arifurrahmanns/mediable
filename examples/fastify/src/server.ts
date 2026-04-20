import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { media } from './media.js'

mkdirSync('./storage/media', { recursive: true })

const app = Fastify({ logger: { level: 'info' } })

// Laravel-style `request.file()` lives in @fastify/multipart — one register call.
await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } })
await app.register(fastifyStatic, {
  root: resolve(process.cwd(), 'storage/media'),
  prefix: '/media/',
})

app.post('/users/:id/avatar', async (req, reply) => {
  const { id } = req.params as { id: string }
  const data = await req.file()
  if (!data) return reply.code(400).send({ error: 'file required' })

  const record = await media.addMedia({
    model: { type: 'User', id },
    // @fastify/multipart hands us { file: Readable, filename, mimetype } —
    // mediable.addMedia() accepts that shape natively.
    file: { stream: data.file, filename: data.filename, mimetype: data.mimetype },
    collection: 'avatars',
    customProperties: { uploadedFrom: req.ip },
  })
  return reply.code(201).send(record)
})

app.get('/users/:id/avatar', async (req, reply) => {
  const { id } = req.params as { id: string }
  const record = await media.getFirst({ type: 'User', id }, 'avatars')
  if (!record) return reply.code(404).send({ error: 'no avatar' })
  return {
    record,
    // `preview` may still be processing in the queue — fallback is automatic.
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
  // YOUR authorization:
  // if (req.user?.id !== record.modelId) return reply.code(403).send()
  await media.delete(record.id)
  return reply.code(204).send()
})

// Signed-URL terminator
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
  return `<!doctype html>
<html><body style="font-family:sans-serif;max-width:640px;margin:2rem auto">
  <h1>mediable example — fastify</h1>
  <form method="post" enctype="multipart/form-data" action="/users/u1/avatar">
    <p><input type="file" name="file" accept="image/*" required /></p>
    <p><button type="submit">Upload avatar for user u1</button></p>
  </form>
  <p><a href="/users/u1/avatar">GET /users/u1/avatar</a></p>
</body></html>`
})

const port = Number(process.env.PORT ?? 3000)
await app.listen({ port })
console.log(`mediable fastify example listening on http://localhost:${port}`)
