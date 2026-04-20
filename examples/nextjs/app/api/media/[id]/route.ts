import { Readable } from 'node:stream'
import { media } from '@/lib/media'

export const runtime = 'nodejs'

// Stream bytes (with optional ?conversion=thumb query)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const record = await media.get(id)
  if (!record) return new Response(null, { status: 404 })

  const url = new URL(req.url)
  const conversion = url.searchParams.get('conversion') ?? undefined
  const { body, contentType, contentLength } = await media.stream(record, conversion)

  const webStream = Readable.toWeb(body) as unknown as ReadableStream
  return new Response(webStream, {
    headers: {
      'content-type': contentType,
      ...(contentLength ? { 'content-length': String(contentLength) } : {}),
    },
  })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const record = await media.get(id)
  if (!record) return new Response(null, { status: 404 })
  // YOUR authorization:
  // const session = await getSession()
  // if (session?.userId !== record.modelId) return new Response(null, { status: 403 })
  await media.delete(record.id)
  return new Response(null, { status: 204 })
}
