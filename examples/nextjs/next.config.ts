import type { NextConfig } from 'next'

const config: NextConfig = {
  // mediable uses node:fs, sharp, better-sqlite3 etc — keep these server-only.
  serverExternalPackages: ['mediable', 'sharp', 'better-sqlite3'],
}

export default config
