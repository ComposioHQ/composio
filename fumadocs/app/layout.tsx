import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import { IBM_Plex_Mono } from 'next/font/google';

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
        <RootProvider
          theme={{
            defaultTheme: 'light',
            attribute: 'class',
            enableSystem: false,
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
