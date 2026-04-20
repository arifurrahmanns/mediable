import { redirect } from 'next/navigation'
import { media } from '@/lib/media'

export const runtime = 'nodejs' // mediable uses node:fs, sharp, pg, etc.

// Upload via HTML <form> or JSON fetch. Both work — Next.js parses multipart
// natively via `request.formData()`.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return Response.json({ error: 'file field required' }, { status: 400 })
  }
  await media.addMedia({
    model: { type: 'User', id },
    file,
    collection: 'avatars',
  })
  // Redirect back for the HTML form case; clients posting fetch still see a 303.
  redirect('/')
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const record = await media.getFirst({ type: 'User', id }, 'avatars')
  if (!record) return Response.json({ error: 'no avatar' }, { status: 404 })
  return Response.json({
    record,
    thumbUrl: await media.url(record, 'thumb'),
    previewUrl: await media.url(record, 'preview'),
  })
}
