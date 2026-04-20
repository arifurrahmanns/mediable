import type { ReactNode } from 'react'

export const metadata = {
  title: 'mediable — Next.js example',
  description: 'Headless media library wired into Next.js App Router',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'sans-serif', maxWidth: 640, margin: '2rem auto' }}>
        {children}
      </body>
    </html>
  )
}
