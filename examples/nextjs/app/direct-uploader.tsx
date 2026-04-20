'use client'

import { useRef, useState } from 'react'

/**
 * Client component for the direct-to-storage upload flow:
 *   1. POST /api/presign-upload → { uuid, uploadUrl, method, headers }
 *   2. PUT uploadUrl with raw file bytes (no server hop)
 *   3. POST /api/confirm-upload with the uuid → MediaRecord
 */
export function DirectUploader() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [log, setLog] = useState('')
  const [busy, setBusy] = useState(false)

  async function upload() {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setLog('pick a file first')
      return
    }
    setBusy(true)
    setLog('')
    const say = (s: string) => setLog((prev) => prev + s + '\n')
    try {
      say(`1) requesting presigned URL for ${file.name} (${file.size} bytes)…`)
      const ps = await fetch('/api/presign-upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: 'u1',
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
          collection: 'avatars',
        }),
      }).then((r) => r.json())

      if (!ps.uploadUrl) throw new Error(ps.error ?? 'presign failed')
      say(`   got uuid=${ps.uuid}`)

      say(`2) PUTting bytes to ${new URL(ps.uploadUrl).host}…`)
      const putRes = await fetch(ps.uploadUrl, {
        method: ps.method,
        headers: ps.headers,
        body: file,
      })
      if (!putRes.ok) throw new Error(`PUT failed: ${putRes.status} ${putRes.statusText}`)
      say(`   PUT ${putRes.status} OK`)

      say('3) confirming…')
      const rec = await fetch('/api/confirm-upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uuid: ps.uuid }),
      }).then((r) => r.json())

      say('\nMediaRecord:\n' + JSON.stringify(rec, null, 2))
    } catch (e) {
      say(`\nerror: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p>
        <input ref={fileRef} type="file" accept="image/*" disabled={busy} />
      </p>
      <p>
        <button
          onClick={upload}
          disabled={busy}
          style={{ padding: '0.5rem 1rem', cursor: busy ? 'wait' : 'pointer' }}
        >
          {busy ? 'Uploading…' : 'Upload direct to bucket'}
        </button>
      </p>
      <pre
        style={{
          background: '#f6f6f6',
          padding: '0.75rem',
          borderRadius: 4,
          whiteSpace: 'pre-wrap',
          fontSize: '0.85rem',
          minHeight: '2em',
          margin: 0,
        }}
      >
        {log}
      </pre>
    </>
  )
}
