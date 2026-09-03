import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Analytics } from '@vercel/analytics/next';
import './global.css';
import { JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import { PostHogProvider } from '@/components/posthog-provider';
import CustomSearchDialog from '@/components/custom-search-dialog';
import { ScrollReset } from '@/components/scroll-reset';
import { source, referenceSource } from '@/lib/source';
import { TOOLKIT_COUNT_LABEL } from '@/lib/toolkit-count';
import { ProductTransitionLoader } from '@/components/product-transition-loader';
import { DocsProductProvider } from '@/components/docs-product-context';
import {
  DEFAULT_DOCS_PRODUCT,
  DOCS_PRODUCTS,
  DOCS_PRODUCT_HEADER,
  parseDocsProduct,
} from '@/lib/home-navigation';

const defaultLinkSlugs: { slug: string[]; source: typeof source }[] = [
  { slug: ['quickstart'], source },
  { slug: ['authentication'], source },
  { slug: ['configuring-sessions'], source },
  { slug: ['authentication', 'white-labeling-authentication'], source },
  { slug: ['glossary'], source: referenceSource },
  { slug: ['troubleshooting'], source },
];

const defaultLinks = defaultLinkSlugs.flatMap(({ slug, source: pageSource }) => {
  const page = pageSource.getPage(slug);
  if (!page) return [];
  return [{ title: page.data.title, description: page.data.description ?? '', href: page.url }];
});

const SITE_DESCRIPTION = `Build AI agents with ${TOOLKIT_COUNT_LABEL} tools. Connect LLMs to external services like GitHub, Slack, Gmail, and more.`;

export const metadata: Metadata = {
  title: {
    default: 'Composio Docs',
    template: '%s | Composio',
  },
  description: SITE_DESCRIPTION,
  metadataBase: new URL('https://docs.composio.dev'),
  openGraph: {
    title: 'Composio Docs',
    description: SITE_DESCRIPTION,
    siteName: 'Composio Docs',
    type: 'website',
    images: ['https://og.composio.dev/api/og?title=Composio%20Docs'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Composio Docs',
    description: SITE_DESCRIPTION,
    images: ['https://og.composio.dev/api/og?title=Composio%20Docs'],
  },
};

const abcDiatype = localFont({
  src: [
    { path: '../public/fonts/ABCDiatype-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/ABCDiatype-RegularItalic.woff2', weight: '400', style: 'italic' },
    { path: '../public/fonts/ABCDiatype-Medium.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export default async function Layout({ children }: LayoutProps<'/'>) {
  const initialProduct =
    parseDocsProduct((await headers()).get(DOCS_PRODUCT_HEADER)) ?? DEFAULT_DOCS_PRODUCT;
  const initialTheme = DOCS_PRODUCTS[initialProduct].theme;

  return (
    <html
      lang="en"
      className={`${abcDiatype.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{localStorage.setItem('theme','${initialTheme}')}catch{}document.documentElement.classList.remove('light','dark');document.documentElement.classList.add('${initialTheme}');document.documentElement.style.colorScheme='${initialTheme}'`,
          }}
        />
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
                  description: SITE_DESCRIPTION,
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
        <ScrollReset />
        <ProductTransitionLoader />
        <Analytics />
        <PostHogProvider>
          <RootProvider
            theme={{
              defaultTheme: 'system',
              attribute: 'class',
              enableSystem: true,
              hotKey: false,
            }}
            search={{
              SearchDialog: CustomSearchDialog,
              options: {
                api: '/api/search',
                defaultLinks,
              } as Record<string, unknown>,
            }}
          >
            <DocsProductProvider initialProduct={initialProduct}>{children}</DocsProductProvider>
          </RootProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
