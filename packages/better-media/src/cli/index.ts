import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, relative, resolve } from 'node:path'
import type prompts from 'prompts'

const requireShim = createRequire(import.meta.url)
type PromptsFn = typeof prompts

type DbChoice = 'sqlite' | 'prisma' | 'drizzle' | 'postgres' | 'mysql' | 'mongoose' | 'none'
type QueueChoice = 'in-process' | 'bullmq'

interface InitAnswers {
  outPath: string
  secret: string
  db: DbChoice
  dbFilename?: string
  dbUrlEnv?: string
  mongoUrlEnv?: string
  queue: QueueChoice
  redisUrlEnv?: string
  storageRoot: string
  includeExample: boolean
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const [cmd, ...rest] = argv
  switch (cmd) {
    case undefined:
    case 'init':
      return init(rest)
    case 'help':
    case '--help':
    case '-h':
      return help()
    default:
      console.error(`unknown command: ${cmd}\n`)
      help()
      process.exit(1)
  }
}

function help(): void {
  console.log(`better-media — media library CLI

Usage:
  npx better-media <command> [options]

Commands:
  init                    Scaffold a media.ts config file for this project
  help                    Show this message

init options:
  -y, --yes               Accept defaults (SQLite, in-process queue, example owner)
  --out <path>            Config output path (default: src/media.ts)
`)
}

async function init(argv: string[]): Promise<void> {
  const prompts = requireShim('prompts') as PromptsFn

  const acceptDefaults = argv.includes('-y') || argv.includes('--yes')
  const outIdx = argv.indexOf('--out')
  const outFlag = outIdx >= 0 ? argv[outIdx + 1] : undefined

  console.log(`\n  better-media — scaffold a config\n`)

  const answers = acceptDefaults
    ? applyDefaults({ outPath: outFlag })
    : await askAll(prompts, outFlag)

  if (!answers) {
    console.error('aborted')
    process.exit(1)
  }

  const absPath = resolve(process.cwd(), answers.outPath)

  if (existsSync(absPath) && !acceptDefaults) {
    const { overwrite } = await prompts(
      {
        type: 'confirm',
        name: 'overwrite',
        message: `${answers.outPath} already exists. Overwrite?`,
        initial: false,
      },
      { onCancel: () => process.exit(1) },
    )
    if (!overwrite) {
      console.log('aborted')
      process.exit(1)
    }
  }

  mkdirSync(dirname(absPath), { recursive: true })
  writeFileSync(absPath, renderConfig(answers))

  console.log(`\n  wrote ${relative(process.cwd(), absPath)}`)
  printFollowUp(answers)
}

function applyDefaults(partial: Partial<InitAnswers>): InitAnswers {
  return {
    outPath: partial.outPath ?? 'src/media.ts',
    secret: randomBytes(32).toString('hex'),
    db: 'sqlite',
    dbFilename: './storage/media.db',
    queue: 'in-process',
    storageRoot: './storage/media',
    includeExample: true,
  }
}

async function askAll(
  prompts: PromptsFn,
  outFlag: string | undefined,
): Promise<InitAnswers | null> {
  const onCancel = { onCancel: () => true }

  const base = await prompts(
    [
      {
        type: 'text',
        name: 'outPath',
        message: 'Config file path',
        initial: outFlag ?? 'src/media.ts',
      },
      {
        type: 'select',
        name: 'db',
        message: 'Database / ORM',
        choices: [
          { title: 'SQLite (built-in, zero config — great for dev)', value: 'sqlite' },
          { title: 'Prisma (SQL + MongoDB; most popular ORM)', value: 'prisma' },
          { title: 'Drizzle (type-safe SQL — Postgres, MySQL, SQLite)', value: 'drizzle' },
          { title: 'PostgreSQL (Kysely + pg; no ORM)', value: 'postgres' },
          { title: 'MySQL / MariaDB (Kysely + mysql2; no ORM)', value: 'mysql' },
          { title: 'MongoDB (Mongoose)', value: 'mongoose' },
          { title: "I'll wire the adapter myself", value: 'none' },
        ],
        initial: 0,
      },
    ],
    onCancel,
  )

  if (!base.db) return null

  const dbFollowUps = await prompts(
    [
      {
        type: base.db === 'sqlite' ? 'text' : null,
        name: 'dbFilename',
        message: 'SQLite filename',
        initial: './storage/media.db',
      },
      {
        type: base.db === 'postgres' || base.db === 'mysql' ? 'text' : null,
        name: 'dbUrlEnv',
        message: 'Database URL env variable',
        initial: 'DATABASE_URL',
      },
      {
        type: base.db === 'mongoose' ? 'text' : null,
        name: 'mongoUrlEnv',
        message: 'MongoDB connection URI env variable',
        initial: 'MONGO_URL',
      },
    ],
    onCancel,
  )

  const queueAnswer = await prompts(
    {
      type: 'select',
      name: 'queue',
      message: 'Queue (for conversions)',
      choices: [
        { title: 'In-process (no external dep, not durable)', value: 'in-process' },
        { title: 'BullMQ (Redis-backed, durable)', value: 'bullmq' },
      ],
      initial: 0,
    },
    onCancel,
  )

  const redisFollowUp = await prompts(
    {
      type: queueAnswer.queue === 'bullmq' ? 'text' : null,
      name: 'redisUrlEnv',
      message: 'Redis URL env variable',
      initial: 'REDIS_URL',
    },
    onCancel,
  )

  const rest = await prompts(
    [
      {
        type: 'text',
        name: 'storageRoot',
        message: 'Local storage root',
        initial: './storage/media',
      },
      {
        type: 'confirm',
        name: 'includeExample',
        message: 'Include an example User.avatars collection?',
        initial: true,
      },
    ],
    onCancel,
  )

  if (rest.includeExample === undefined) return null

  return {
    outPath: base.outPath,
    secret: randomBytes(32).toString('hex'),
    db: base.db as DbChoice,
    dbFilename: dbFollowUps.dbFilename,
    dbUrlEnv: dbFollowUps.dbUrlEnv,
    mongoUrlEnv: dbFollowUps.mongoUrlEnv,
    queue: queueAnswer.queue as QueueChoice,
    redisUrlEnv: redisFollowUp.redisUrlEnv,
    storageRoot: rest.storageRoot,
    includeExample: Boolean(rest.includeExample),
  }
}

function renderConfig(a: InitAnswers): string {
  const lines: string[] = []
  const imports: string[] = [`import { betterMedia, LocalStorage } from 'better-media'`]
  imports.push(`import { sharpProcessor } from 'better-media/sharp'`)

  if (a.queue === 'bullmq') {
    imports.push(`import { bullmqQueue } from 'better-media/bullmq'`)
  }

  let databaseBlock = ''
  let preBlock = ''

  switch (a.db) {
    case 'sqlite':
      databaseBlock = `  database: {
    provider: 'sqlite',
    connection: { filename: ${q(a.dbFilename ?? './storage/media.db')} },
    autoMigrate: true,
  },`
      break

    case 'prisma':
      preBlock = `// 1) Add a Media model to schema.prisma (see better-media README → "Database › Prisma").
// 2) Run: pnpm prisma migrate dev
// 3) Copy the prismaAdapter from the README into ./prisma-media-adapter.ts.

// import { PrismaClient } from '@prisma/client'
// import { prismaAdapter } from './prisma-media-adapter'
// const prisma = new PrismaClient()\n`
      databaseBlock = `  database: /* TODO: prismaAdapter(prisma) */ undefined as any,`
      break

    case 'drizzle':
      preBlock = `// 1) Define the 'media' table in your drizzle schema (see better-media README → "Database › Drizzle").
// 2) Run your drizzle-kit migrations.
// 3) Copy the drizzleAdapter from the README into ./drizzle-media-adapter.ts.

// import { db } from './db'
// import { drizzleAdapter } from './drizzle-media-adapter'\n`
      databaseBlock = `  database: /* TODO: drizzleAdapter(db) */ undefined as any,`
      break

    case 'postgres':
      imports.push(`import { kyselyAdapter, type KyselyDatabaseSchema } from 'better-media'`)
      imports.push(`import { Kysely, PostgresDialect } from 'kysely'`)
      imports.push(`import { Pool } from 'pg'`)
      preBlock = `const db = new Kysely<KyselyDatabaseSchema>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: process.env.${a.dbUrlEnv ?? 'DATABASE_URL'} }),
  }),
})\n`
      databaseBlock = `  database: kyselyAdapter(db, { autoMigrate: true }),`
      break

    case 'mysql':
      imports.push(`import { kyselyAdapter, type KyselyDatabaseSchema } from 'better-media'`)
      imports.push(`import { Kysely, MysqlDialect } from 'kysely'`)
      imports.push(`import { createPool } from 'mysql2'`)
      preBlock = `const db = new Kysely<KyselyDatabaseSchema>({
  dialect: new MysqlDialect({
    pool: createPool({ uri: process.env.${a.dbUrlEnv ?? 'DATABASE_URL'} }),
  }),
})\n`
      databaseBlock = `  database: kyselyAdapter(db, { autoMigrate: true }),`
      break

    case 'mongoose':
      preBlock = `// 1) Connect to MongoDB once at startup:
//      import mongoose from 'mongoose'
//      await mongoose.connect(process.env.${a.mongoUrlEnv ?? 'MONGO_URL'}!)
// 2) Copy the mongooseAdapter from the README into ./mongoose-media-adapter.ts.

// import { mongooseAdapter } from './mongoose-media-adapter'\n`
      databaseBlock = `  database: /* TODO: mongooseAdapter() */ undefined as any,`
      break

    case 'none':
      preBlock = `// TODO: provide a DatabaseAdapter. See the "Database" section of the better-media README.\n`
      databaseBlock = `  database: /* TODO */ undefined as any,`
      break
  }

  const queueBlock =
    a.queue === 'bullmq'
      ? `  queue: bullmqQueue({
    connection: process.env.${a.redisUrlEnv ?? 'REDIS_URL'}!,
    concurrency: 4,
  }),\n`
      : ''

  const ownersBlock = a.includeExample
    ? `  owners: {
    User: ({ collection }) => {
      collection('avatars')
        .singleFile()
        .accepts('image/*')
        .maxSize('5MB')
        .convert('thumb', (i) => i.width(96).height(96).fit('cover').format('webp'))
    },
  },\n`
    : `  owners: {
    // Define per-owner collections and conversions here.
    // Example:
    //   User: ({ collection, convert }) => {
    //     collection('avatars').singleFile().accepts('image/*').maxSize('5MB')
    //       .convert('thumb', (i) => i.width(96).height(96).fit('cover').format('webp'))
    //   },
  },\n`

  lines.push(imports.sort().join('\n'))
  lines.push('')
  if (preBlock) lines.push(preBlock)
  lines.push(`export const media = betterMedia({`)
  lines.push(`  secret: process.env.MEDIA_SECRET!,`)
  lines.push('')
  lines.push(databaseBlock)
  lines.push('')
  lines.push(`  storage: {
    default: 'local',
    disks: {
      local: LocalStorage({
        root: ${q(a.storageRoot)},
        publicUrlBase: '/media',
      }),
    },
  },`)
  lines.push('')
  lines.push(`  image: sharpProcessor(),`)
  if (queueBlock) {
    lines.push('')
    lines.push(queueBlock.trimEnd())
  }
  lines.push('')
  lines.push(ownersBlock.trimEnd())
  lines.push(`})`)
  lines.push('')

  return lines.join('\n')
}

function q(s: string): string {
  return `'${s.replace(/'/g, "\\'")}'`
}

function printFollowUp(a: InitAnswers): void {
  const steps: string[] = []
  steps.push(`Add MEDIA_SECRET to your .env:`)
  steps.push(`    MEDIA_SECRET=${a.secret}`)

  const deps: string[] = []
  const devDeps: string[] = []
  if (a.db === 'postgres') {
    deps.push('pg')
    devDeps.push('@types/pg')
  }
  if (a.db === 'mysql') deps.push('mysql2')
  if (a.db === 'prisma') {
    deps.push('@prisma/client')
    devDeps.push('prisma')
  }
  if (a.db === 'drizzle') {
    deps.push('drizzle-orm')
    devDeps.push('drizzle-kit')
  }
  if (a.db === 'mongoose') deps.push('mongoose')

  if (deps.length > 0) {
    steps.push('')
    steps.push(`Install database deps:`)
    steps.push(`    pnpm add ${deps.join(' ')}`)
    if (devDeps.length > 0) steps.push(`    pnpm add -D ${devDeps.join(' ')}`)
  }

  if (a.queue === 'bullmq') {
    steps.push('')
    steps.push(`Set ${a.redisUrlEnv ?? 'REDIS_URL'} in your .env (e.g. redis://localhost:6379)`)
  }

  if (a.db === 'prisma') {
    steps.push('')
    steps.push(`Add the Media model to schema.prisma (see README → "Database › Prisma"), then:`)
    steps.push(`    pnpm prisma migrate dev`)
    steps.push(`Copy the prismaAdapter from the README into ./prisma-media-adapter.ts.`)
  }
  if (a.db === 'drizzle') {
    steps.push('')
    steps.push(`Define the 'media' table in your drizzle schema (see README → "Database › Drizzle").`)
    steps.push(`Run your drizzle-kit migration, then copy drizzleAdapter into ./drizzle-media-adapter.ts.`)
  }
  if (a.db === 'mongoose') {
    steps.push('')
    steps.push(`Set ${a.mongoUrlEnv ?? 'MONGO_URL'} in your .env (e.g. mongodb://localhost:27017/myapp).`)
    steps.push(`Copy mongooseAdapter from the README into ./mongoose-media-adapter.ts.`)
  }
  if (a.db === 'postgres' || a.db === 'mysql') {
    steps.push('')
    steps.push(`On first run the 'media' table is auto-created (autoMigrate: true).`)
    steps.push(`If autoMigrate errors on your dialect, run the SQL from the README manually.`)
  }
  if (a.db === 'none') {
    steps.push('')
    steps.push(`Finish the TODO in ${a.outPath} — see the "Database" section of the README.`)
  }

  steps.push('')
  steps.push(`Use it in a route:`)
  steps.push(`    import { media } from './media'`)
  steps.push(`    const record = await media.addMedia({`)
  steps.push(`      model: { type: 'User', id: userId },`)
  steps.push(`      file: req.file,                    // multer / fastify / Hono File / Buffer / stream`)
  steps.push(`      collection: 'avatars',`)
  steps.push(`    })`)

  console.log(`\n  Next steps:\n`)
  for (const line of steps) {
    console.log(line.startsWith('    ') ? `    ${line.slice(4)}` : `  ${line}`)
  }
  console.log('')
}
