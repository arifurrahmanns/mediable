import { mkdirSync } from 'node:fs'
import express, { type Request, type Response, type NextFunction } from 'express'
import multer from 'multer'
import { media } from './media.js'
import { demoHtml } from './demo-html.js'

mkdirSync('./storage/media', { recursive: true })

const app = express()
app.use(express.json())
app.use('/media', express.static('./storage/media'))

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
})

// ─────────── Server-proxied upload (multipart) ───────────
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

// ─────────── Direct-to-storage upload ───────────
// Step 1 — client posts file metadata, gets a presigned URL.
app.post('/api/presign-upload', async (req, res, next) => {
  try {
    const result = await media.presignUpload({
      model: { type: 'User', id: req.body.userId ?? 'u1' },
      fileName: req.body.fileName,
      mimeType: req.body.mimeType,
      size: req.body.size,
      collection: req.body.collection ?? 'avatars',
      expiresInSeconds: 600,
    })
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// Step 2 happens in the browser — PUT bytes directly to uploadUrl.

// Step 3 — client reports the upload finished; we verify + enqueue conversions.
app.post('/api/confirm-upload', async (req, res, next) => {
  try {
    const record = await media.confirmUpload({ uuid: req.body.uuid })
    res.status(201).json(record)
  } catch (err) {
    next(err)
  }
})

// ─────────── Retrieval / delete / signed URLs ───────────
app.get('/users/:id/avatar', async (req, res, next) => {
  try {
    const record = await media.getFirst({ type: 'User', id: req.params.id! }, 'avatars')
    if (!record) return res.status(404).json({ error: 'no avatar' })
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
    await media.delete(record.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

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
  res.type('html').send(demoHtml('Express'))
})

const port = Number(process.env.PORT ?? 3000)
app.listen(port, () => {
  console.log(`mediable example (express) listening on http://localhost:${port}`)
})
