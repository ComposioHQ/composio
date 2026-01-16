import type { Metadata } from 'next';
import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import { IBM_Plex_Mono } from 'next/font/google';
import { PostHogProvider } from '@/components/posthog-provider';

export const metadata: Metadata = {
  metadataBase: new URL('https://docs.composio.dev'),
  title: {
    default: 'Composio Docs',
    template: '%s | Composio Docs',
  },
  description: 'Documentation for Composio - Connect agents to tools',
  icons: {
    icon: '/favicon.png',
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex flex-col min-h-screen font-sans">
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
      </body>
    </html>
  );
}
