import Link from 'next/link'
import type { ReactNode } from 'react'

export default function HomePage() {
  return (
    <main className="flex-1 relative">
      <Hero />
      <FeatureBento />
      <CodeShowcase />
      <FrameworkGrid />
      <FooterCTA />
    </main>
  )
}

/* ─────────────── Hero ─────────────── */

function Hero() {
  return (
    <section className="relative isolate overflow-hidden border-b border-fd-border">
      {/* Animated aurora */}
      <div className="aurora">
        <div className="aurora-blob" />
      </div>

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 grid-pattern radial-fade text-fd-foreground opacity-[0.6]" />

      <div className="relative mx-auto max-w-6xl px-6 pt-28 pb-24 md:pt-36 md:pb-32 text-center">
        {/* Announcement pill */}
        <Link
          href="/docs/direct-upload"
          className="fade-up inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-card/50 backdrop-blur px-4 py-1.5 text-xs font-medium hover:border-fd-foreground/20 transition-colors"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          <span>v0.2 — Direct-to-storage uploads are live</span>
          <ArrowRight className="h-3 w-3 opacity-60" />
        </Link>

        {/* Headline */}
        <h1
          className="fade-up mt-10 text-5xl sm:text-6xl md:text-7xl font-semibold tracking-[-0.04em] leading-[0.95]"
          style={{ animationDelay: '80ms' }}
        >
          The media library
          <br />
          <span className="bg-gradient-to-b from-fd-foreground to-fd-muted-foreground bg-clip-text text-transparent">
            Node.js deserved.
          </span>
        </h1>

        <p
          className="fade-up mt-8 mx-auto max-w-2xl text-lg md:text-xl text-fd-muted-foreground leading-relaxed"
          style={{ animationDelay: '180ms' }}
        >
          Headless, framework-agnostic uploads for any model in your app. Name the
          collection, declare the conversions, call a function. No middleware, no router,
          no lock-in.
        </p>

        <div
          className="fade-up mt-12 flex flex-col sm:flex-row items-center justify-center gap-3"
          style={{ animationDelay: '280ms' }}
        >
          <Link
            href="/docs"
            className="group inline-flex items-center gap-2 rounded-full bg-fd-foreground px-6 py-3 text-sm font-medium text-fd-background hover:opacity-90 transition-all hover:gap-3"
          >
            Read the docs
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="https://github.com/arifurrahmanns/mediable"
            className="inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-card/50 backdrop-blur px-6 py-3 text-sm font-medium hover:border-fd-foreground/20 hover:bg-fd-accent transition-colors"
          >
            <GitHubIcon className="h-4 w-4" />
            Star on GitHub
          </Link>
        </div>

        {/* Install command card */}
        <div
          className="fade-up mt-14 mx-auto inline-flex items-center gap-3 rounded-full border border-fd-border bg-fd-card/70 backdrop-blur px-5 py-2.5 font-mono text-sm shadow-sm"
          style={{ animationDelay: '360ms' }}
        >
          <span className="text-fd-muted-foreground select-none">$</span>
          <span className="text-fd-foreground">pnpm add mediable</span>
          <span className="inline-block h-4 w-px bg-fd-border" aria-hidden />
          <CopyHint />
        </div>
      </div>
    </section>
  )
}

/* ─────────────── Feature bento ─────────────── */

function FeatureBento() {
  return (
    <section className="relative border-b border-fd-border">
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
        <div className="max-w-2xl">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-[-0.03em]">
            Everything you need.
            <br />
            <span className="text-fd-muted-foreground">Nothing you don't.</span>
          </h2>
          <p className="mt-5 text-fd-muted-foreground text-lg">
            One config file. One API. Drop it into any framework, swap storage at deploy
            time, scale conversions through BullMQ when you're ready.
          </p>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-3 md:grid-rows-[auto_auto]">
          <BentoCard
            className="md:col-span-2"
            icon={<LayersIcon />}
            title="Polymorphic attachments"
            body="Attach any file to any model — users, products, posts — via (modelType, modelId) tuples. One table, infinite owners. No Eloquent trait, no ORM lock-in, no schema surgery."
          />
          <BentoCard
            icon={<DatabaseIcon />}
            title="4 databases built-in"
            body="SQLite, Postgres, MySQL, MongoDB. autoMigrate on first request, or run CLI upfront. Bring Prisma or Drizzle if you prefer."
          />
          <BentoCard
            icon={<CloudIcon />}
            title="S3 / R2 / MinIO / B2"
            body="One driver, every S3-compatible backend. Swap dev → prod with a config change."
          />
          <BentoCard
            className="md:col-span-2"
            icon={<UploadIcon />}
            title="Direct-to-storage uploads"
            body="Three-phase flow: presign → client PUTs direct to bucket → confirm. Your Node process never touches the bytes. Real mime sniff on confirm — clients can't spoof the content type."
            highlight
          />
          <BentoCard
            className="md:col-span-3"
            icon={<WandIcon />}
            title="Image conversions as code"
            body="Declare thumb, preview, card variants with a Sharp-backed DSL. Inline for fast paths, BullMQ-queued for heavy work, prioritized so interactive jobs beat background optimizations."
          />
        </div>
      </div>
    </section>
  )
}

function BentoCard({
  icon,
  title,
  body,
  className = '',
  highlight = false,
}: {
  icon: ReactNode
  title: string
  body: string
  className?: string
  highlight?: boolean
}) {
  return (
    <div
      className={`glow-border group relative overflow-hidden rounded-2xl border border-fd-border bg-fd-card p-7 transition-colors hover:border-fd-foreground/10 ${className}`}
    >
      {highlight ? (
        <div className="absolute inset-0 -z-10 dot-pattern text-fd-primary opacity-30" />
      ) : null}
      <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-lg border border-fd-border bg-fd-background/50 text-fd-foreground/80 transition-colors group-hover:text-fd-foreground">
        {icon}
      </div>
      <h3 className="relative z-10 mt-5 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="relative z-10 mt-2 text-sm leading-relaxed text-fd-muted-foreground">
        {body}
      </p>
    </div>
  )
}

/* ─────────────── Code showcase ─────────────── */

function CodeShowcase() {
  return (
    <section className="relative border-b border-fd-border">
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
        <div className="grid gap-12 md:grid-cols-2 items-start">
          <div className="md:sticky md:top-24">
            <span className="inline-block rounded-full border border-fd-border bg-fd-card px-3 py-1 text-xs text-fd-muted-foreground">
              1. Configure once
            </span>
            <h2 className="mt-5 text-3xl md:text-4xl font-semibold tracking-[-0.03em]">
              One <span className="font-mono text-fd-primary">media.ts</span> file
            </h2>
            <p className="mt-5 text-fd-muted-foreground leading-relaxed">
              Owners, collections, conversions, storage, database — every decision lives
              in one place. Changes propagate automatically to every route that imports{' '}
              <code className="rounded bg-fd-muted px-1.5 py-0.5 text-sm">media</code>.
            </p>
            <Link
              href="/docs/quick-start"
              className="group mt-6 inline-flex items-center gap-2 text-sm font-medium text-fd-foreground hover:gap-3 transition-all"
            >
              Walk through the quick start
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <TerminalCard file="src/media.ts">
            <pre className="p-5 text-[13px] leading-relaxed overflow-x-auto">
              <code
                className="block"
                dangerouslySetInnerHTML={{ __html: CONFIG_SAMPLE_HTML }}
              />
            </pre>
          </TerminalCard>
        </div>

        {/* Usage side */}
        <div className="mt-16 md:mt-24 grid gap-12 md:grid-cols-2 items-start">
          <TerminalCard file="app/api/upload/route.ts">
            <pre className="p-5 text-[13px] leading-relaxed overflow-x-auto">
              <code
                className="block"
                dangerouslySetInnerHTML={{ __html: USAGE_SAMPLE_HTML }}
              />
            </pre>
          </TerminalCard>

          <div>
            <span className="inline-block rounded-full border border-fd-border bg-fd-card px-3 py-1 text-xs text-fd-muted-foreground">
              2. Use anywhere
            </span>
            <h2 className="mt-5 text-3xl md:text-4xl font-semibold tracking-[-0.03em]">
              Call functions.
              <br />
              <span className="text-fd-muted-foreground">No middleware.</span>
            </h2>
            <p className="mt-5 text-fd-muted-foreground leading-relaxed">
              mediable doesn't own routing. Drop{' '}
              <code className="rounded bg-fd-muted px-1.5 py-0.5 text-sm">
                media.addMedia()
              </code>{' '}
              into any Express / Hono / Fastify / NestJS / Next.js handler and it just
              works. Validation, storage, DB write, and conversions happen in one call.
            </p>
            <Link
              href="/docs/api"
              className="group mt-6 inline-flex items-center gap-2 text-sm font-medium text-fd-foreground hover:gap-3 transition-all"
            >
              See the full API
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

function TerminalCard({ file, children }: { file: string; children: ReactNode }) {
  return (
    <div className="terminal-card rounded-xl border border-fd-border shadow-sm shadow-black/5 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-fd-border px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
        </div>
        <span className="ml-2 font-mono text-xs text-fd-muted-foreground">{file}</span>
      </div>
      {children}
    </div>
  )
}

/* Tiny static syntax-highlight — HTML strings. Avoids a highlighter dep.
 * The `text-*` classes come from Tailwind; Tailwind scans this file for them. */
const KW = (s: string) =>
  `<span class="text-fuchsia-500 dark:text-fuchsia-400">${s}</span>`
const STR = (s: string) =>
  `<span class="text-emerald-600 dark:text-emerald-400">${s}</span>`
const FN = (s: string) =>
  `<span class="text-sky-600 dark:text-sky-400">${s}</span>`
const PROP = (s: string) =>
  `<span class="text-amber-600 dark:text-amber-400">${s}</span>`
const NUM = (s: string) =>
  `<span class="text-orange-600 dark:text-orange-400">${s}</span>`
const CMT = (s: string) =>
  `<span class="text-fd-muted-foreground/70 italic">${s}</span>`

const CONFIG_SAMPLE_HTML = [
  `${KW('import')} { mediable, LocalStorage } ${KW('from')} ${STR("'mediable'")}`,
  `${KW('import')} { sharpProcessor } ${KW('from')} ${STR("'mediable/sharp'")}`,
  `${KW('import')} { s3Storage } ${KW('from')} ${STR("'mediable/s3'")}`,
  ``,
  `${KW('export const')} ${FN('media')} = ${FN('mediable')}({`,
  `  secret: process.env.${PROP('MEDIA_SECRET')}!,`,
  ``,
  `  database: {`,
  `    provider: ${STR("'postgres'")},`,
  `    connection: { url: process.env.DATABASE_URL! },`,
  `    autoMigrate: ${KW('true')},`,
  `  },`,
  ``,
  `  storage: {`,
  `    default: ${STR("'s3'")},`,
  `    disks: {`,
  `      s3: ${FN('s3Storage')}({ bucket: ${STR("'uploads'")}, ... }),`,
  `    },`,
  `  },`,
  ``,
  `  image: ${FN('sharpProcessor')}(),`,
  ``,
  `  owners: {`,
  `    ${PROP('User')}: ({ collection }) => {`,
  `      ${FN('collection')}(${STR("'avatars'")})`,
  `        .${FN('singleFile')}()`,
  `        .${FN('accepts')}(${STR("'image/*'")})`,
  `        .${FN('maxSize')}(${STR("'5MB'")})`,
  `        .${FN('convert')}(${STR("'thumb'")}, (i) => i.${FN('width')}(${NUM('96')}).${FN('format')}(${STR("'webp'")})),`,
  `    },`,
  `  },`,
  `})`,
].join('\n')

const USAGE_SAMPLE_HTML = [
  `${KW('import')} { media } ${KW('from')} ${STR("'@/lib/media'")}`,
  ``,
  `${KW('export async function')} ${FN('POST')}(req: Request) {`,
  `  ${KW('const')} form = ${KW('await')} req.${FN('formData')}()`,
  `  ${KW('const')} file = form.${FN('get')}(${STR("'file'")}) ${KW('as')} File`,
  ``,
  `  ${CMT('// validation, storage, DB write, conversions — one call')}`,
  `  ${KW('const')} record = ${KW('await')} media.${FN('addMedia')}({`,
  `    model: { type: ${STR("'User'")}, id: userId },`,
  `    file,`,
  `    collection: ${STR("'avatars'")},`,
  `  })`,
  ``,
  `  ${KW('return')} Response.${FN('json')}(record)`,
  `}`,
].join('\n')

/* ─────────────── Framework grid ─────────────── */

function FrameworkGrid() {
  return (
    <section className="relative border-b border-fd-border">
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-[-0.03em]">
            Works with your stack.
          </h2>
          <p className="mt-5 text-fd-muted-foreground text-lg">
            Five working examples in the repo. Same{' '}
            <code className="rounded bg-fd-muted px-1.5 py-0.5 text-sm">media.ts</code>,
            framework-specific route wrapper.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { name: 'Express', href: '/docs/frameworks#express' },
            { name: 'Hono', href: '/docs/frameworks#hono' },
            { name: 'Fastify', href: '/docs/frameworks#fastify' },
            { name: 'NestJS', href: '/docs/frameworks#nestjs' },
            { name: 'Next.js', href: '/docs/frameworks#nextjs' },
          ].map((f) => (
            <Link
              key={f.name}
              href={f.href}
              className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-fd-border bg-fd-card/50 backdrop-blur p-6 transition-all hover:border-fd-foreground/20 hover:-translate-y-0.5"
            >
              <span className="text-sm font-medium tracking-tight">{f.name}</span>
              <ArrowRight className="h-3.5 w-3.5 text-fd-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─────────────── Footer CTA ─────────────── */

function FooterCTA() {
  return (
    <section className="relative isolate overflow-hidden">
      <div className="aurora opacity-60">
        <div className="aurora-blob" />
      </div>
      <div className="absolute inset-0 grid-pattern radial-fade text-fd-foreground opacity-40" />

      <div className="relative mx-auto max-w-4xl px-6 py-28 md:py-36 text-center">
        <h2 className="text-4xl md:text-5xl font-semibold tracking-[-0.03em]">
          Ready to ship your uploads?
        </h2>
        <p className="mt-5 mx-auto max-w-xl text-fd-muted-foreground text-lg">
          Every concept, every framework, every storage backend. Start with the quick
          start or jump straight to direct-to-storage uploads.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/docs/quick-start"
            className="group inline-flex items-center gap-2 rounded-full bg-fd-foreground px-6 py-3 text-sm font-medium text-fd-background hover:opacity-90 transition-all hover:gap-3"
          >
            Quick start
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/docs/direct-upload"
            className="inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-card/50 backdrop-blur px-6 py-3 text-sm font-medium hover:border-fd-foreground/20 hover:bg-fd-accent transition-colors"
          >
            Direct-to-storage uploads
          </Link>
        </div>
      </div>
    </section>
  )
}

/* ─────────────── Misc ─────────────── */

function CopyHint() {
  return (
    <span className="flex items-center gap-1.5 text-xs text-fd-muted-foreground">
      <CopyIcon className="h-3 w-3" />
      copy
    </span>
  )
}

/* ─────────────── Icons (inline SVG — no icon-lib dep) ─────────────── */

function ArrowRight({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  )
}
function GitHubIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .5a12 12 0 0 0-3.79 23.4c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.6-4.04-1.6-.55-1.39-1.34-1.76-1.34-1.76-1.1-.75.08-.73.08-.73 1.22.08 1.86 1.25 1.86 1.25 1.08 1.85 2.84 1.31 3.54 1 .1-.78.42-1.31.76-1.61-2.66-.3-5.46-1.33-5.46-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.3-1.55 3.3-1.23 3.3-1.23.67 1.65.25 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.62-2.8 5.63-5.47 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z" />
    </svg>
  )
}
function CopyIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}
function LayersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.91a1 1 0 0 0 0-1.83Z" />
      <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
      <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
    </svg>
  )
}
function WandIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M15 9h.01M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5" />
    </svg>
  )
}
function DatabaseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
    </svg>
  )
}
function CloudIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.5 19a4.5 4.5 0 1 0 0-9h-1.8A7 7 0 1 0 4 17.5" />
    </svg>
  )
}
function UploadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </svg>
  )
}
