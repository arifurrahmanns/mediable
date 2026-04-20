import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <>
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-label="mediable logo"
        >
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="11" r="1.5" />
          <path d="M21 17l-5-5-4 4-3-3-6 6" />
        </svg>
        <span className="font-semibold">mediable</span>
      </>
    ),
  },
  links: [
    {
      text: 'Documentation',
      url: '/docs',
      active: 'nested-url',
    },
    {
      text: 'Examples',
      url: 'https://github.com/arifurrahmanns/mediable/tree/main/examples',
      external: true,
    },
    {
      text: 'GitHub',
      url: 'https://github.com/arifurrahmanns/mediable',
      external: true,
    },
  ],
}
