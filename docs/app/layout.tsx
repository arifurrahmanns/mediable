import './global.css'
import { RootProvider } from 'fumadocs-ui/provider/next'
import { Geist, Geist_Mono } from 'next/font/google'
import type { ReactNode } from 'react'

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
})

export const metadata = {
  title: {
    default: 'mediable — Headless media library for Node.js',
    template: '%s — mediable',
  },
  description:
    'Attach files to any model with named collections, image conversions, pluggable storage (local, S3, R2, MinIO, B2) and databases (SQLite, Postgres, MySQL, MongoDB). Framework-agnostic.',
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="flex flex-col min-h-screen bg-fd-background text-fd-foreground antialiased">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  )
}
