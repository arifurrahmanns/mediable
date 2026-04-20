# @mediable/docs

The docs site for [mediable](https://github.com/arifurrahmanns/mediable). Built with [Next.js 16](https://nextjs.org) + [Fumadocs](https://fumadocs.vercel.app) + Tailwind v4.

## Development

```bash
pnpm install
pnpm dev                          # http://localhost:3000
```

Editing content:

- **Landing page** — `app/(home)/page.tsx`
- **Docs pages (MDX)** — `content/docs/*.mdx`
- **Sidebar order** — `content/docs/meta.json`
- **Nav / header** — `app/layout.config.tsx`

Saving any MDX file triggers a hot-reload.

## Structure

```
docs/
├─ app/
│  ├─ (home)/              # landing page route group
│  ├─ docs/[[...slug]]/    # all docs pages render here
│  ├─ layout.tsx           # root layout
│  └─ layout.config.tsx    # nav title + header links
├─ content/docs/           # MDX source for every docs page
├─ lib/source.ts           # fumadocs content loader
├─ source.config.ts        # fumadocs-mdx config
└─ next.config.ts          # Next.js + MDX integration
```

## Adding a page

1. Create `content/docs/new-page.mdx`:
   ```md
   ---
   title: My new page
   description: Short summary for the sidebar + metadata.
   ---

   Content here.
   ```

2. Add `"new-page"` to `content/docs/meta.json` where you want it in the sidebar.

3. Save — Fumadocs picks it up on the next request.

## Build

```bash
pnpm build
pnpm start
```

Deploy to Vercel with zero config — the project is a standard Next.js 16 app.
