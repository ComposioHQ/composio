import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import { Inter, IBM_Plex_Mono } from 'next/font/google';
import localFont from 'next/font/local';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const flecha = localFont({
  src: './fonts/Flecha Font.otf',
  variable: '--font-flecha',
  display: 'swap',
});

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${ibmPlexMono.variable} ${flecha.variable}`}
      suppressHydrationWarning
    >
      <body className={`${inter.className} flex flex-col min-h-screen`}>
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
