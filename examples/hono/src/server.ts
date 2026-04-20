import { mkdirSync } from 'node:fs'
import { Readable } from 'node:stream'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { media } from './media.js'
import { demoHtml } from './demo-html.js'

mkdirSync('./storage/media', { recursive: true })

const app = new Hono()

app.use('/media/*', serveStatic({ root: './storage' }))

// ─────────── Server-proxied upload (multipart) ───────────
app.post('/users/:id/avatar', async (c) => {
  const form = await c.req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return c.json({ error: 'file field required' }, 400)
  }
  const record = await media.addMedia({
    model: { type: 'User', id: c.req.param('id') },
    file,
    collection: 'avatars',
    customProperties: { uploadedFrom: c.req.header('x-forwarded-for') ?? 'local' },
  })
  return c.json(record, 201)
})

// ─────────── Direct-to-storage upload ───────────
app.post('/api/presign-upload', async (c) => {
  const body = await c.req.json()
  const result = await media.presignUpload({
    model: { type: 'User', id: body.userId ?? 'u1' },
    fileName: body.fileName,
    mimeType: body.mimeType,
    size: body.size,
    collection: body.collection ?? 'avatars',
    expiresInSeconds: 600,
  })
  return c.json(result)
})

app.post('/api/confirm-upload', async (c) => {
  const { uuid } = await c.req.json()
  const record = await media.confirmUpload({ uuid })
  return c.json(record, 201)
})

// ─────────── Retrieval / delete / signed URLs ───────────
app.get('/users/:id/avatar', async (c) => {
  const record = await media.getFirst({ type: 'User', id: c.req.param('id') }, 'avatars')
  if (!record) return c.json({ error: 'no avatar' }, 404)
  return c.json({
    record,
    thumbUrl: await media.url(record, 'thumb'),
    previewUrl: await media.url(record, 'preview'),
  })
})

app.get('/products/:id/gallery', async (c) => {
  const list = await media.list({ type: 'Product', id: c.req.param('id') }, 'gallery')
  return c.json(list)
})

app.delete('/media/:id', async (c) => {
  const record = await media.get(c.req.param('id'))
  if (!record) return c.body(null, 404)
  await media.delete(record.id)
  return c.body(null, 204)
})

app.get('/signed/:token', async (c) => {
  const verified = await media.verifySignedToken(c.req.param('token'))
  if (!verified) return c.body(null, 403)
  const { body, contentType, contentLength } = await media.stream(verified.media)
  const webStream = Readable.toWeb(body) as unknown as ReadableStream
  return new Response(webStream, {
    headers: {
      'content-type': contentType,
      ...(contentLength ? { 'content-length': String(contentLength) } : {}),
    },
  })
})

app.get('/', (c) => c.html(demoHtml('Hono')))

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, () =>
  console.log(`mediable example (hono) listening on http://localhost:${port}`),
)
