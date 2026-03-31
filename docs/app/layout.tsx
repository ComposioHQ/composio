import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './global.css';
import { Inter, IBM_Plex_Mono } from 'next/font/google';
import { PostHogProvider } from '@/components/posthog-provider';
import { DecimalWidget } from '@/components/decimal-widget';
import CustomSearchDialog from '@/components/custom-search-dialog';
import { source } from '@/lib/source';

const defaultLinkSlugs = [
  ['quickstart'],
  ['authentication'],
  ['configuring-sessions'],
  ['white-labeling-authentication'],
  ['glossary'],
  ['common-faq'],
  ['troubleshooting'],
];

const defaultLinks = defaultLinkSlugs.flatMap((slug) => {
  const page = source.getPage(slug);
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

const inter = Inter({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${ibmPlexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#131211" media="(prefers-color-scheme: dark)" />
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
                    'https://twitter.com/composiohq',
                    'https://discord.gg/composio',
                  ],
                },
              ],
            }),
          }}
        />
      </head>
      <body className="flex flex-col min-h-dvh font-sans">
        <Analytics />
        <PostHogProvider>
          <RootProvider
            theme={{
              defaultTheme: 'light',
              attribute: 'class',
              enableSystem: true,
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
        <DecimalWidget />
      </body>
    </html>
  );
}
