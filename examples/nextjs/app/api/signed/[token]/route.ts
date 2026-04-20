import { Readable } from 'node:stream'
import { media } from '@/lib/media'

export const runtime = 'nodejs'

// Signed-URL terminator — verifies HMAC token then streams the bytes.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const verified = await media.verifySignedToken(token)
  if (!verified) return new Response(null, { status: 403 })

  const { body, contentType, contentLength } = await media.stream(verified.media)
  const webStream = Readable.toWeb(body) as unknown as ReadableStream
  return new Response(webStream, {
    headers: {
      'content-type': contentType,
      ...(contentLength ? { 'content-length': String(contentLength) } : {}),
    },
  })
}
