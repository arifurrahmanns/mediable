import { mkdirSync } from 'node:fs'
import express, { type Request, type Response, type NextFunction } from 'express'
import multer from 'multer'
import { media } from './media.js'

mkdirSync('./storage/media', { recursive: true })

const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

app.use('/media', express.static('./storage/media'))

app.post(
  '/users/:id/avatar',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'file required' })
      const record = await media.addMedia({
        model: { type: 'User', id: req.params.id! },
        file: req.file,
        collection: 'avatars',
        customProperties: { uploadedFrom: req.ip },
      })
      res.status(201).json(record)
    } catch (err) {
      next(err)
    }
  },
)

app.get('/users/:id/avatar', async (req, res, next) => {
  try {
    const record = await media.getFirst({ type: 'User', id: req.params.id! }, 'avatars')
    if (!record) return res.status(404).json({ error: 'no avatar' })
    // `preview` may still be processing in the queue — fallback to original is automatic.
    res.json({
      record,
      thumbUrl: await media.url(record, 'thumb'),
      previewUrl: await media.url(record, 'preview'),
    })
  } catch (err) {
    next(err)
  }
})

app.get('/products/:id/gallery', async (req, res, next) => {
  try {
    const list = await media.list({ type: 'Product', id: req.params.id! }, 'gallery')
    res.json(list)
  } catch (err) {
    next(err)
  }
})

app.delete('/media/:id', async (req, res, next) => {
  try {
    const record = await media.get(req.params.id!)
    if (!record) return res.status(404).end()
    // YOUR authorization:
    // if (req.user?.id !== record.modelId) return res.status(403).end()
    await media.delete(record.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

// Signed-URL terminator — verify token then stream bytes
app.get('/signed/:token', async (req, res, next) => {
  try {
    const verified = await media.verifySignedToken(req.params.token!)
    if (!verified) return res.status(403).end()
    const { body, contentType, contentLength } = await media.stream(verified.media)
    res.setHeader('content-type', contentType)
    if (contentLength) res.setHeader('content-length', String(contentLength))
    body.pipe(res)
  } catch (err) {
    next(err)
  }
})

app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html><body style="font-family:sans-serif;max-width:640px;margin:2rem auto">
  <h1>mediakit example</h1>
  <form method="post" enctype="multipart/form-data" action="/users/u1/avatar">
    <p><input type="file" name="file" accept="image/*" required /></p>
    <p><button type="submit">Upload avatar for user u1</button></p>
  </form>
  <p><a href="/users/u1/avatar">GET /users/u1/avatar</a></p>
</body></html>`)
})

const port = Number(process.env.PORT ?? 3000)
app.listen(port, () => {
  console.log(`mediakit example listening on http://localhost:${port}`)
})
