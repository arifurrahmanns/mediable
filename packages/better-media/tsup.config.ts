import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'sharp/index': 'src/sharp/index.ts',
    'bullmq/index': 'src/bullmq/index.ts',
    'cli/index': 'src/cli/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'node20',
  external: ['better-sqlite3', 'sharp', 'bullmq', 'ioredis', 'prompts'],
})
