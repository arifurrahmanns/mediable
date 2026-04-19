import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, relative, resolve } from 'node:path'
import type prompts from 'prompts'
import { sqlMigrationTemplate } from './templates.js'

declare const __filename: string | undefined
const requireShim = createRequire(
  typeof __filename !== 'undefined' ? __filename : import.meta.url,
)
type PromptsFn = typeof prompts

type DbChoice = 'sqlite' | 'postgres' | 'mysql' | 'mongodb' | 'custom'
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
    case 'migrate':
      return migrate(rest)
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
  console.log(`mediakit — media library CLI

Usage:
  npx mediakit <command> [options]

Commands:
  init                    Scaffold a media.ts config file for this project
  migrate                 Load the config and apply the database schema
  help                    Show this message

init options:
  -y, --yes               Accept defaults (SQLite, in-process queue, example owner)
  --out <path>            Config output path (default: src/media.ts)

migrate options:
  --config <path>         Path to the config file (default: auto-discover)
`)
}

// ---------- init ----------

async function init(argv: string[]): Promise<void> {
  const prompts = requireShim('prompts') as PromptsFn

  const acceptDefaults = argv.includes('-y') || argv.includes('--yes')
  const outIdx = argv.indexOf('--out')
  const outFlag = outIdx >= 0 ? argv[outIdx + 1] : undefined

  console.log(`\n  mediakit — scaffold a config\n`)

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

  const written: string[] = [absPath]

  // Emit a reference SQL migration file for Postgres / MySQL — the adapter
  // auto-applies on first use, but having the SQL on disk is handy if the
  // user later wants to run it through their own migration tool.
  if (answers.db === 'postgres' || answers.db === 'mysql') {
    const sqlPath = resolve(process.cwd(), 'migrations/0001_create_media.sql')
    if (!existsSync(sqlPath)) {
      mkdirSync(dirname(sqlPath), { recursive: true })
      writeFileSync(sqlPath, sqlMigrationTemplate(answers.db))
      written.push(sqlPath)
    }
  }

  for (const p of written) console.log(`  wrote ${relative(process.cwd(), p)}`)
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
        message: 'Database',
        choices: [
          { title: 'SQLite (built-in, zero config — great for dev)', value: 'sqlite' },
          { title: 'PostgreSQL (built-in; needs `pnpm add pg`)', value: 'postgres' },
          { title: 'MySQL / MariaDB (built-in; needs `pnpm add mysql2`)', value: 'mysql' },
          { title: 'MongoDB (built-in; needs `pnpm add mongoose`)', value: 'mongodb' },
          { title: "Custom adapter (Prisma / Drizzle / write your own — see README)", value: 'custom' },
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
        type: base.db === 'mongodb' ? 'text' : null,
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
  const imports = new Set<string>([
    `import { mediakit, LocalStorage } from 'mediakit'`,
    `import { sharpProcessor } from 'mediakit/sharp'`,
  ])
  if (a.queue === 'bullmq') imports.add(`import { bullmqQueue } from 'mediakit/bullmq'`)

  let databaseBlock = ''
  switch (a.db) {
    case 'sqlite':
      databaseBlock = `  database: {
    provider: 'sqlite',
    connection: { filename: ${q(a.dbFilename ?? './storage/media.db')} },
    autoMigrate: true,
  },`
      break
    case 'postgres':
      databaseBlock = `  database: {
    provider: 'postgres',
    connection: { url: process.env.${a.dbUrlEnv ?? 'DATABASE_URL'}! },
    autoMigrate: true,
  },`
      break
    case 'mysql':
      databaseBlock = `  database: {
    provider: 'mysql',
    connection: { url: process.env.${a.dbUrlEnv ?? 'DATABASE_URL'}! },
    autoMigrate: true,
  },`
      break
    case 'mongodb':
      databaseBlock = `  database: {
    provider: 'mongodb',
    connection: { url: process.env.${a.mongoUrlEnv ?? 'MONGO_URL'}! },
  },`
      break
    case 'custom':
      databaseBlock = `  // TODO: provide a DatabaseAdapter. See README → "Database".
  // Examples: prismaAdapter(prisma), drizzleAdapter(db), or your own.
  database: /* TODO */ undefined as any,`
      break
  }

  const queueBlock =
    a.queue === 'bullmq'
      ? `\n  queue: bullmqQueue({
    connection: process.env.${a.redisUrlEnv ?? 'REDIS_URL'}!,
    concurrency: 4,
  }),`
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
  },`
    : `  owners: {
    // Define per-owner collections and conversions here.
    // Example:
    //   User: ({ collection, convert }) => {
    //     collection('avatars').singleFile().accepts('image/*').maxSize('5MB')
    //       .convert('thumb', (i) => i.width(96).height(96).fit('cover').format('webp'))
    //   },
  },`

  return [
    [...imports].sort().join('\n'),
    '',
    'export const media = mediakit({',
    `  secret: process.env.MEDIA_SECRET!,`,
    '',
    databaseBlock,
    '',
    `  storage: {
    default: 'local',
    disks: {
      local: LocalStorage({
        root: ${q(a.storageRoot)},
        publicUrlBase: '/media',
      }),
    },
  },`,
    '',
    `  image: sharpProcessor(),`,
    queueBlock,
    '',
    ownersBlock,
    '})',
    '',
  ].join('\n')
}

function q(s: string): string {
  return `'${s.replace(/'/g, "\\'")}'`
}

function printFollowUp(a: InitAnswers): void {
  const steps: string[] = []
  steps.push(`Add MEDIA_SECRET to your .env:`)
  steps.push(`    MEDIA_SECRET=${a.secret}`)

  const deps: string[] = []
  if (a.db === 'postgres') deps.push('pg')
  if (a.db === 'mysql') deps.push('mysql2')
  if (a.db === 'mongodb') deps.push('mongoose')

  if (deps.length > 0) {
    steps.push('')
    steps.push(`Install database driver:`)
    steps.push(`    pnpm add ${deps.join(' ')}`)
  }

  if (a.db === 'postgres' || a.db === 'mysql') {
    steps.push('')
    steps.push(`Set ${a.dbUrlEnv ?? 'DATABASE_URL'} in your .env (e.g. postgres://user:pass@host:5432/db).`)
    steps.push(`Then apply the schema:`)
    steps.push(`    npx mediakit migrate`)
    steps.push(`(or just start the app — autoMigrate creates the table on first use.)`)
  }

  if (a.db === 'mongodb') {
    steps.push('')
    steps.push(`Set ${a.mongoUrlEnv ?? 'MONGO_URL'} in your .env (e.g. mongodb://localhost:27017/myapp).`)
    steps.push(`Then build the indexes:`)
    steps.push(`    npx mediakit migrate`)
  }

  if (a.queue === 'bullmq') {
    steps.push('')
    steps.push(`Set ${a.redisUrlEnv ?? 'REDIS_URL'} in your .env (e.g. redis://localhost:6379).`)
  }

  if (a.db === 'custom') {
    steps.push('')
    steps.push(`Finish the TODO in ${a.outPath} — see README → "Database" for Prisma / Drizzle / custom paths.`)
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

// ---------- migrate ----------

async function migrate(argv: string[]): Promise<void> {
  const configIdx = argv.indexOf('--config')
  const explicit = configIdx >= 0 ? argv[configIdx + 1] : undefined

  const configPath = explicit
    ? resolve(process.cwd(), explicit)
    : discoverConfig()

  if (!configPath) {
    console.error(
      `\nmediakit migrate: could not find a config file.\n` +
        `Pass one with --config <path>, or run \`npx mediakit init\` first.\n`,
    )
    process.exit(1)
  }

  console.log(`\n  loading ${relative(process.cwd(), configPath)} …`)

  const loaded = await loadConfigModule(configPath)
  const instance = pickMediaInstance(loaded)
  if (!instance) {
    console.error(
      `\nmediakit migrate: the config did not export a mediakit instance.\n` +
        `Ensure the file contains \`export const media = mediakit({...})\` ` +
        `(or any named export whose value is a mediakit instance).\n`,
    )
    process.exit(1)
  }

  if (typeof (instance as any).migrate !== 'function') {
    console.error(
      `\nmediakit migrate: the loaded instance has no .migrate() method. ` +
        `Your library version may be out of date.\n`,
    )
    process.exit(1)
  }

  try {
    await (instance as any).migrate()
    console.log(`  migration applied successfully.\n`)
  } catch (err) {
    console.error(`\n  migration failed:`, (err as Error).message, '\n')
    process.exit(1)
  }
}

function discoverConfig(): string | null {
  const candidates = [
    'mediakit.config.ts',
    'mediakit.config.js',
    'mediakit.config.mjs',
    'src/media.ts',
    'src/lib/media.ts',
    'lib/media.ts',
    'server/media.ts',
    'app/media.ts',
  ]
  for (const rel of candidates) {
    const abs = resolve(process.cwd(), rel)
    if (existsSync(abs)) return abs
  }
  return null
}

async function loadConfigModule(path: string): Promise<Record<string, unknown>> {
  if (path.endsWith('.js') || path.endsWith('.mjs') || path.endsWith('.cjs')) {
    return await import(pathToFileUrl(path))
  }
  // TypeScript — use jiti to load at runtime without a build step.
  const jiti = tryRequireJiti()
  if (!jiti) {
    throw new Error(
      "Loading a .ts config requires 'jiti'. Install with: pnpm add -D jiti",
    )
  }
  const load = jiti(process.cwd(), {
    esmResolve: true,
    interopDefault: true,
  })
  return load(path)
}

function tryRequireJiti(): any | null {
  try {
    const mod = requireShim('jiti')
    return mod.default ?? mod
  } catch {
    return null
  }
}

function pathToFileUrl(p: string): string {
  const url = new URL('file://')
  // Windows-safe conversion
  url.pathname = p.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, '/$1:')
  return url.toString()
}

function pickMediaInstance(mod: Record<string, unknown>): unknown | null {
  // Prefer `media`; then `default`; then the first export that looks like an instance.
  const byName = (mod as any).media
  if (isMediaKitInstance(byName)) return byName
  const def = (mod as any).default
  if (isMediaKitInstance(def)) return def
  for (const v of Object.values(mod)) {
    if (isMediaKitInstance(v)) return v
  }
  return null
}

function isMediaKitInstance(v: unknown): boolean {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as any).addMedia === 'function' &&
    typeof (v as any).$context === 'object'
  )
}
