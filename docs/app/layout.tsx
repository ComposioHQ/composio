import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './global.css';
import { Inter, JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import { PostHogProvider } from '@/components/posthog-provider';
import CustomSearchDialog from '@/components/custom-search-dialog';
import { ScrollReset } from '@/components/scroll-reset';
import { source, referenceSource } from '@/lib/source';

const defaultLinkSlugs: { slug: string[]; source: typeof source }[] = [
  { slug: ['quickstart'], source },
  { slug: ['authentication'], source },
  { slug: ['configuring-sessions'], source },
  { slug: ['white-labeling-authentication'], source },
  { slug: ['glossary'], source: referenceSource },
  { slug: ['troubleshooting'], source },
];

const defaultLinks = defaultLinkSlugs.flatMap(({ slug, source: pageSource }) => {
  const page = pageSource.getPage(slug);
  if (!page) return [];
  return [{ title: page.data.title, description: page.data.description ?? '', href: page.url }];
});

export const metadata: Metadata = {
  title: {
    default: 'Composio Docs',
    template: '%s | Composio',
  },
  description: 'Build AI agents with 1000+ tools. Connect LLMs to external services like GitHub, Slack, Gmail, and more.',
  metadataBase: new URL('https://docs.composio.dev'),
  openGraph: {
    title: 'Composio Docs',
    description: 'Build AI agents with 1000+ tools. Connect LLMs to external services like GitHub, Slack, Gmail, and more.',
    siteName: 'Composio Docs',
    type: 'website',
    images: ['https://og.composio.dev/api/og?title=Composio%20Docs'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Composio Docs',
    description: 'Build AI agents with 1000+ tools. Connect LLMs to external services like GitHub, Slack, Gmail, and more.',
    images: ['https://og.composio.dev/api/og?title=Composio%20Docs'],
  },
};

const abcDiatype = localFont({
  src: [
    { path: '../public/fonts/ABCDiatype-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/ABCDiatype-RegularItalic.woff2', weight: '400', style: 'italic' },
    { path: '../public/fonts/ABCDiatype-Medium.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${abcDiatype.variable} ${inter.variable} ${jetbrainsMono.variable} dark`}
      suppressHydrationWarning
    >
      <head>
        <meta name="theme-color" content="#050912" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'WebSite',
                  '@id': 'https://docs.composio.dev/#website',
                  url: 'https://docs.composio.dev',
                  name: 'Composio Docs',
                  description: 'Build AI agents with 1000+ tools. Connect LLMs to external services like GitHub, Slack, Gmail, and more.',
                  publisher: { '@id': 'https://composio.dev/#organization' },
                },
                {
                  '@type': 'Organization',
                  '@id': 'https://composio.dev/#organization',
                  name: 'Composio',
                  url: 'https://composio.dev',
                  logo: {
                    '@type': 'ImageObject',
                    url: 'https://composio.dev/logo.png',
                  },
                  sameAs: [
                    'https://github.com/composiohq',
                  ],
                },
              ],
            }),
          }}
        />
      </head>
      <body className="flex flex-col min-h-dvh font-sans">
        <ScrollReset />
        <Analytics />
        <PostHogProvider>
          <RootProvider
            theme={{
              defaultTheme: 'dark',
              attribute: 'class',
              enableSystem: false,
              forcedTheme: 'dark',
              themes: ['dark'],
            }}
            search={{
              SearchDialog: CustomSearchDialog,
              options: {
                api: '/api/search',
                defaultLinks,
              } as Record<string, unknown>,
            }}
          >
            {children}
          </RootProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
