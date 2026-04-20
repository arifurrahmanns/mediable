import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'sharp/index': 'src/sharp/index.ts',
    'bullmq/index': 'src/bullmq/index.ts',
    'mongoose/index': 'src/mongoose/index.ts',
    's3/index': 'src/s3/index.ts',
    'cli/index': 'src/cli/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'node20',
  external: [
    'better-sqlite3',
    'sharp',
    'bullmq',
    'ioredis',
    'prompts',
    'mongoose',
    'pg',
    'mysql2',
    'jiti',
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
  ],
})
