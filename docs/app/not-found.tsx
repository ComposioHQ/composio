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
  const path =
    headersList.get('x-pathname') || headersList.get('x-invoke-path') || 'unknown';

  // Fire and forget - don't block rendering
  log404ToDatadog(path, referer);

  return (
    <div className="relative flex min-h-[85vh] flex-col items-center justify-center overflow-hidden px-4">
      {/* Faint giant background 404 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex select-none items-center justify-center text-fd-foreground/[0.04] dark:text-white/[0.04]"
        style={{
          fontSize: 'clamp(200px, 30vw, 500px)',
          fontWeight: 500,
          lineHeight: 1,
          letterSpacing: '-0.04em',
        }}
      >
        404
      </div>

      {/* Foreground glitch 404 */}
      <h1
        aria-label="404 — Page not found"
        className="animate-glitch-404 relative font-sans text-[96px] font-medium leading-none tracking-tighter text-fd-foreground sm:text-[128px]"
      >
        404
      </h1>

      <div className="relative mt-6 text-center max-w-md">
        <h2 className="font-mono text-sm uppercase tracking-[-0.28px] text-fd-muted-foreground">
          Page not found
        </h2>
        <p className="mt-3 font-mono text-sm leading-relaxed text-fd-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
          <br />
          <span className="text-fd-muted-foreground/70">
            Press{' '}
            <kbd className="mx-1 rounded border border-fd-border bg-fd-muted px-1.5 py-0.5 font-mono text-[10px]">
              ⌘K
            </kbd>{' '}
            to search.
          </span>
        </p>
      </div>

      <div className="relative mt-8">
        <Link
          href="/docs"
          className="group inline-flex items-center gap-1.5 bg-[var(--composio-brand)] px-4 py-2.5 font-mono text-sm uppercase tracking-[-0.28px] text-white no-underline transition-colors hover:bg-[#0006a8]"
          style={{ color: '#ffffff' }}
        >
          <span style={{ color: '#ffffff' }}>Back to docs</span>
        </Link>
      </div>
    </div>
  );
}
