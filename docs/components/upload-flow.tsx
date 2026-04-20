import type { ReactNode } from 'react'

/**
 * Visual replacement for the ASCII sequence diagram in the direct-upload docs.
 * Renders each phase as a step card with a from→to participant indicator,
 * an HTTP method pill, and description text.
 */
export function UploadFlow() {
  return (
    <div className="not-prose my-8 space-y-3">
      <FlowStep
        n={1}
        from="Browser"
        to="Your backend"
        title="Presign"
        method="POST /api/presign-upload"
      >
        <p>
          Backend validates against the collection config, reserves a DB row with{' '}
          <InlineCode>status='pending'</InlineCode>, and asks the storage driver to
          sign a PUT URL tied to one specific key.
        </p>
        <p>
          Returns{' '}
          <InlineCode>{'{ uuid, uploadUrl, method, headers, expires }'}</InlineCode>
          .
        </p>
      </FlowStep>

      <FlowStep
        n={2}
        from="Browser"
        to="R2 / S3"
        title="Direct upload"
        method="PUT uploadUrl"
        tone="accent"
      >
        <p>
          Browser PUTs the raw file bytes straight to the bucket. Your Node process
          is <strong>not in this hop</strong> — it only hands out the signed URL.
        </p>
      </FlowStep>

      <FlowStep
        n={3}
        from="Browser"
        to="Your backend"
        title="Confirm"
        method="POST /api/confirm-upload"
      >
        <p>
          Backend verifies the object exists, sniffs the real mime type from the
          first 4&nbsp;KB, re-validates size against{' '}
          <InlineCode>maxSize</InlineCode>, flips to{' '}
          <InlineCode>status='ready'</InlineCode>, and fires{' '}
          <InlineCode>onMediaAdded</InlineCode>. Queued conversions are enqueued
          fire-and-forget.
        </p>
        <p>
          Returns the fresh <InlineCode>MediaRecord</InlineCode>.
        </p>
      </FlowStep>

      <FlowStep
        n={4}
        from="BullMQ worker"
        to="R2 / S3"
        title="Process (async)"
        method="Background job"
        tone="muted"
      >
        <p>
          Worker downloads the original, runs the Sharp plan for each queued
          conversion, uploads the variants back to the bucket, and flips{' '}
          <InlineCode>generatedConversions[name]</InlineCode> to{' '}
          <InlineCode>true</InlineCode> on the record.
        </p>
        <p>
          Your UI can poll <InlineCode>media.url(record, 'thumb')</InlineCode> —
          it falls back to the original until the variant is ready.
        </p>
      </FlowStep>
    </div>
  )
}

/* ─────────────── Primitives ─────────────── */

function FlowStep({
  n,
  from,
  to,
  title,
  method,
  children,
  tone = 'primary',
}: {
  n: number
  from: string
  to: string
  title: string
  method: string
  children: ReactNode
  tone?: 'primary' | 'accent' | 'muted'
}) {
  const railClass =
    tone === 'accent'
      ? 'bg-fd-primary'
      : tone === 'muted'
        ? 'bg-fd-border'
        : 'bg-fd-primary/50'

  return (
    <div className="group relative overflow-hidden rounded-xl border border-fd-border bg-fd-card/60 backdrop-blur-sm transition-colors hover:border-fd-foreground/15">
      {/* Vertical accent rail */}
      <span
        className={`absolute left-0 top-0 h-full w-1 ${railClass}`}
        aria-hidden="true"
      />
      <div className="px-6 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fd-primary text-fd-primary-foreground text-[13px] font-semibold tabular-nums">
            {n}
          </div>
          <h3 className="text-base font-semibold tracking-tight">{title}</h3>
          <ParticipantArrow from={from} to={to} />
        </div>
        <div className="mt-3 inline-flex items-center rounded-md border border-fd-border bg-fd-muted/60 px-2 py-1 font-mono text-xs text-fd-muted-foreground">
          {method}
        </div>
        <div className="mt-3 text-[15px] leading-relaxed text-fd-muted-foreground [&>p+p]:mt-2">
          {children}
        </div>
      </div>
    </div>
  )
}

function ParticipantArrow({ from, to }: { from: string; to: string }) {
  return (
    <div className="ml-auto flex items-center gap-2 text-xs text-fd-muted-foreground">
      <span className="font-mono">{from}</span>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 12h14M13 5l7 7-7 7" />
      </svg>
      <span className="font-mono">{to}</span>
    </div>
  )
}

function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-[0.85em] text-fd-foreground">
      {children}
    </code>
  )
}
