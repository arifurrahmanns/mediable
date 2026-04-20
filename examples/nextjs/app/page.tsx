import { media } from '@/lib/media'
import { DirectUploader } from './direct-uploader'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const record = await media.getFirst({ type: 'User', id: 'u1' }, 'avatars')
  const thumbUrl = record ? await media.url(record, 'thumb') : null
  const previewUrl = record ? await media.url(record, 'preview') : null

  return (
    <main>
      <h1 style={{ marginBottom: 0 }}>mediable — Next.js</h1>
      <p style={{ color: '#666', marginTop: 0 }}>Headless media library demo</p>

      {/* ── 1. Server-proxied upload (works with any driver) ── */}
      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>
          1. Server-proxied upload{' '}
          <small style={{ fontWeight: 'normal', color: '#888' }}>(multipart)</small>
        </h2>
        <p style={{ color: '#555' }}>
          Bytes flow browser → your Node process → storage. Works with any driver.
        </p>
        <form method="post" encType="multipart/form-data" action="/api/users/u1/avatar">
          <p>
            <input type="file" name="file" accept="image/*" required />
          </p>
          <p>
            <button type="submit" style={buttonStyle}>Upload via server</button>
          </p>
        </form>
      </section>

      {/* ── 2. Direct-to-storage upload (requires S3) ── */}
      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>
          2. Direct-to-storage upload{' '}
          <small style={{ fontWeight: 'normal', color: '#888' }}>(presigned URL)</small>
        </h2>
        <p style={{ color: '#555' }}>
          Bytes flow browser → bucket. Your Node process only signs the URL and confirms
          the result. Requires an S3-compatible disk — set <code>S3_BUCKET</code>,{' '}
          <code>S3_REGION</code>, <code>S3_ACCESS_KEY</code>, <code>S3_SECRET_KEY</code>{' '}
          (plus <code>S3_ENDPOINT</code> for R2/MinIO/B2) in <code>.env.local</code> and restart.
        </p>
        <DirectUploader />
      </section>

      {record ? (
        <section style={sectionStyle}>
          <h2 style={{ marginTop: 0 }}>Current avatar</h2>
          <p>
            <small>uuid: {record.uuid}</small>
          </p>
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

const sectionStyle: React.CSSProperties = {
  border: '1px solid #e5e5e5',
  borderRadius: 8,
  padding: '1rem 1.5rem',
  marginBottom: '1.5rem',
}

const buttonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  cursor: 'pointer',
}
