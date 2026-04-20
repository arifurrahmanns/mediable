import { media } from '@/lib/media'

export default async function Home() {
  const record = await media.getFirst({ type: 'User', id: 'u1' }, 'avatars')
  const thumbUrl = record ? await media.url(record, 'thumb') : null
  const previewUrl = record ? await media.url(record, 'preview') : null

  return (
    <main>
      <h1>mediable example — Next.js</h1>

      <form method="post" encType="multipart/form-data" action="/api/users/u1/avatar">
        <p>
          <input type="file" name="file" accept="image/*" required />
        </p>
        <p>
          <button type="submit">Upload avatar for user u1</button>
        </p>
      </form>

      {record ? (
        <section>
          <h2>Current avatar</h2>
          <p>uuid: {record.uuid}</p>
          {thumbUrl ? (
            <p>
              <img src={thumbUrl} alt="thumb" />
            </p>
          ) : null}
          {previewUrl ? (
            <p>
              <img src={previewUrl} alt="preview" style={{ maxWidth: 400 }} />
            </p>
          ) : null}
        </section>
      ) : (
        <p>No avatar yet — upload one.</p>
      )}
    </main>
  )
}

export const dynamic = 'force-dynamic'
