import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata } from 'next';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import './global.css';
import { IBM_Plex_Mono } from 'next/font/google';
import { PostHogProvider } from '@/components/posthog-provider';

export const metadata: Metadata = {
  title: {
    default: 'Composio Docs',
    template: '%s | Composio',
  },
  description: 'Build AI agents with 250+ tools. Connect LLMs to external services like GitHub, Slack, Gmail, and more.',
  metadataBase: new URL('https://docs.composio.dev'),
  openGraph: {
    title: 'Composio Docs',
    description: 'Build AI agents with 250+ tools. Connect LLMs to external services like GitHub, Slack, Gmail, and more.',
    siteName: 'Composio Docs',
    type: 'website',
    images: ['https://og.composio.dev/api/og?title=Composio%20Docs'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Composio Docs',
    description: 'Build AI agents with 250+ tools. Connect LLMs to external services like GitHub, Slack, Gmail, and more.',
    images: ['https://og.composio.dev/api/og?title=Composio%20Docs'],
  },
};

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
      className={ibmPlexMono.variable}
      suppressHydrationWarning
    >
      <head>
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#131211" media="(prefers-color-scheme: dark)" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
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
                  description: 'Build AI agents with 250+ tools. Connect LLMs to external services like GitHub, Slack, Gmail, and more.',
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
      <body className="flex flex-col min-h-screen font-sans">
        <Analytics />
        <PostHogProvider>
          <RootProvider
            theme={{
              defaultTheme: 'light',
              attribute: 'class',
              enableSystem: false,
            }}
            search={{
              options: {
                api: '/api/search',
              },
            }}
          >
            {children}
          </RootProvider>
        </PostHogProvider>
        <Script
          src="https://app.getdecimal.ai/widget/v1/widget.js"
          data-widget-id="wgt_Ze0kCx97w7YXIydXpEAbAVWfu7FO6HG1"
          data-public-config="eyJhbGciOiJIUzI1NiJ9.eyJ3aWQiOiJ3Z3RfWmUwa0N4OTd3N1lYSXlkWHBFQWJBVldmdTdGTzZIRzEiLCJkb21haW5zIjpbImNvbXBvc2lvLmRldiIsImNvbXBvc2lvLWRlY2ltYWwudmVyY2VsLmFwcCIsImxvY2FsaG9zdDozMDAwIiwiZG9jcy5jb21wb3Npby5kZXYiLCJmdW1hZG9jcy1wc2kudmVyY2VsLmFwcCJdLCJpYXQiOjE3Njk1MDE3NTZ9.j7odPAOmoKSkdkFHQCs7FDpAxHfJuzUOEMb_OuHi81I"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
