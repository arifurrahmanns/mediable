import { mkdirSync } from 'node:fs'
import { Readable } from 'node:stream'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { media } from './media.js'

mkdirSync('./storage/media', { recursive: true })

const app = new Hono()

app.use('/media/*', serveStatic({ root: './storage' }))

// Upload — no multer / busboy / middleware. `formData()` is built in.
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

app.get('/users/:id/avatar', async (c) => {
  const record = await media.getFirst({ type: 'User', id: c.req.param('id') }, 'avatars')
  if (!record) return c.json({ error: 'no avatar' }, 404)
  return c.json({
    record,
    // `preview` may still be processing in the queue — fallback to original is automatic.
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
  // YOUR authorization:
  // if (c.get('user')?.id !== record.modelId) return c.body(null, 403)
  await media.delete(record.id)
  return c.body(null, 204)
})

// Signed-URL terminator — verify token then stream bytes
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

app.get('/', (c) =>
  c.html(`<!doctype html>
<html><body style="font-family:sans-serif;max-width:640px;margin:2rem auto">
  <h1>mediable example — hono</h1>
  <form method="post" enctype="multipart/form-data" action="/users/u1/avatar">
    <p><input type="file" name="file" accept="image/*" required /></p>
    <p><button type="submit">Upload avatar for user u1</button></p>
  </form>
  <p><a href="/users/u1/avatar">GET /users/u1/avatar</a></p>
</body></html>`),
)

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, () => {
  console.log(`mediable hono example listening on http://localhost:${port}`)
})
