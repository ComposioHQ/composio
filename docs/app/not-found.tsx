import Link from 'next/link';
import { headers } from 'next/headers';

async function log404ToDatadog(path: string, referer: string | null) {
  const apiKey = process.env.DD_API_KEY;
  if (!apiKey) return;

  try {
    await fetch('https://http-intake.logs.datadoghq.com/api/v2/logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': apiKey,
      },
      body: JSON.stringify([
        {
          ddsource: 'composio-docs',
          ddtags: 'env:production,service:docs,status:404',
          hostname: 'docs.composio.dev',
          message: `404 Not Found: ${path}`,
          service: 'docs',
          status: 'warn',
          path,
          referer,
        },
      ]),
    });
  } catch {
    // Silently fail - don't break the 404 page
  }
}

export default async function NotFound() {
  const headersList = await headers();
  const referer = headersList.get('referer');
  const path = headersList.get('x-pathname') || headersList.get('x-invoke-path') || 'unknown';

  // Fire and forget - don't block rendering
  log404ToDatadog(path, referer);

  return (
    <div className="flex min-h-[85vh] flex-col items-center justify-center px-4">
      <div className="relative">
        {/* Subtle gradient glow */}
        <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-fd-primary/20 via-fd-primary/5 to-transparent blur-2xl" />
        <h1 className="relative text-[120px] sm:text-[150px] font-bold leading-none tracking-tighter text-fd-foreground/10 select-none">
          404
        </h1>
      </div>

      <div className="mt-2 text-center max-w-md">
        <h2 className="text-xl font-semibold text-fd-foreground">
          Page not found
        </h2>
        <p className="mt-2 text-fd-muted-foreground text-sm">
          This page doesn&apos;t exist or may have moved.
          <br />
          <span className="text-fd-muted-foreground/70">
            Press <kbd className="mx-1 rounded border border-fd-border bg-fd-muted px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd> to search.
          </span>
        </p>
      </div>

      {/* Quick links */}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/docs"
          className="inline-flex items-center gap-2 rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90"
        >
          Documentation
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg border border-fd-border bg-fd-background px-4 py-2 text-sm font-medium transition-colors hover:bg-fd-accent"
        >
          Home
        </Link>
      </div>

      {/* Secondary links */}
      <nav className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-fd-muted-foreground">
        <Link href="/docs/quickstart" className="hover:text-fd-foreground transition-colors">
          Quickstart
        </Link>
        <Link href="/toolkits" className="hover:text-fd-foreground transition-colors">
          Toolkits
        </Link>
        <Link href="/examples" className="hover:text-fd-foreground transition-colors">
          Examples
        </Link>
        <Link href="/reference" className="hover:text-fd-foreground transition-colors">
          API Reference
        </Link>
      </nav>
    </div>
  );
}
