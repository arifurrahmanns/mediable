import { media } from '@/lib/media'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const body = (await req.json()) as {
    userId?: string
    fileName: string
    mimeType?: string
    size?: number
    collection?: string
  }
  try {
    const result = await media.presignUpload({
      model: { type: 'User', id: body.userId ?? 'u1' },
      fileName: body.fileName,
      mimeType: body.mimeType,
      size: body.size,
      collection: body.collection ?? 'avatars',
      expiresInSeconds: 600,
    })
    return Response.json(result)
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
