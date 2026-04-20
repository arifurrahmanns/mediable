import { revalidatePath } from 'next/cache'
import { media } from '@/lib/media'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const { uuid } = (await req.json()) as { uuid: string }
  try {
    const record = await media.confirmUpload({ uuid })
    // Bust the home page cache so the new avatar shows up on the next visit.
    revalidatePath('/')
    return Response.json(record, { status: 201 })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
