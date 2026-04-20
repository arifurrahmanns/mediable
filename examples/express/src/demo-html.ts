/**
 * Minimal dual-mode upload demo page.
 *
 *   1. A multipart form that POSTs to /users/u1/avatar (server-proxied).
 *   2. A JS button that runs the 3-step direct-to-storage flow:
 *        POST /api/presign-upload  →  PUT uploadUrl  →  POST /api/confirm-upload
 *
 * Works with any framework — pass the framework name as the title.
 */
export function demoHtml(framework: string): string {
  return `<!doctype html>
<html>
<head><meta charset="utf-8" /><title>mediable — ${framework}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:760px;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#111">
  <h1 style="margin-bottom:0">mediable — ${framework}</h1>
  <p style="color:#666;margin-top:0">Headless media library demo</p>

  <section style="border:1px solid #e5e5e5;border-radius:8px;padding:1rem 1.5rem;margin-bottom:1.5rem">
    <h2 style="margin-top:0">1. Server-proxied upload <small style="font-weight:normal;color:#888">(multipart)</small></h2>
    <p style="color:#555">Bytes flow browser → your Node process → storage. Works with any driver.</p>
    <form method="post" enctype="multipart/form-data" action="/users/u1/avatar">
      <p><input type="file" name="file" accept="image/*" required /></p>
      <p><button type="submit" style="padding:0.5rem 1rem">Upload via server</button></p>
    </form>
  </section>

  <section style="border:1px solid #e5e5e5;border-radius:8px;padding:1rem 1.5rem;margin-bottom:1.5rem">
    <h2 style="margin-top:0">2. Direct-to-storage upload <small style="font-weight:normal;color:#888">(presigned URL)</small></h2>
    <p style="color:#555">Bytes flow browser → bucket. Your Node process only signs the URL and confirms the result. Requires an S3-compatible disk — set <code>S3_BUCKET</code>, <code>S3_REGION</code>, <code>S3_ACCESS_KEY</code>, <code>S3_SECRET_KEY</code> (plus <code>S3_ENDPOINT</code> for R2/MinIO/B2) and restart.</p>
    <p><input id="df" type="file" accept="image/*" /></p>
    <p><button id="db" style="padding:0.5rem 1rem">Upload direct to bucket</button></p>
    <pre id="dl" style="background:#f6f6f6;padding:0.75rem;border-radius:4px;white-space:pre-wrap;font-size:0.85rem;min-height:2em;margin:0"></pre>
  </section>

  <p><a href="/users/u1/avatar">GET /users/u1/avatar →</a></p>

  <script>
    document.getElementById('db').addEventListener('click', async () => {
      const f = document.getElementById('df').files[0]
      const log = document.getElementById('dl')
      if (!f) { log.textContent = 'pick a file first'; return }
      const say = (s) => { log.textContent += s + '\\n' }
      log.textContent = ''
      try {
        say('1) requesting presigned URL for ' + f.name + ' (' + f.size + ' bytes)…')
        const ps = await fetch('/api/presign-upload', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            userId: 'u1',
            fileName: f.name,
            mimeType: f.type,
            size: f.size,
            collection: 'avatars',
          }),
        }).then((r) => r.json())

        if (!ps.uploadUrl) throw new Error(ps.error || 'presign failed')
        say('   got uuid=' + ps.uuid)

        say('2) PUTting bytes to ' + new URL(ps.uploadUrl).host + '…')
        const putRes = await fetch(ps.uploadUrl, {
          method: ps.method,
          headers: ps.headers,
          body: f,
        })
        if (!putRes.ok) throw new Error('PUT failed: ' + putRes.status + ' ' + putRes.statusText)
        say('   PUT ' + putRes.status + ' OK')

        say('3) confirming…')
        const rec = await fetch('/api/confirm-upload', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ uuid: ps.uuid }),
        }).then((r) => r.json())

        say('\\nMediaRecord:\\n' + JSON.stringify(rec, null, 2))
      } catch (e) {
        say('\\nerror: ' + e.message)
      }
    })
  </script>
</body>
</html>`
}
