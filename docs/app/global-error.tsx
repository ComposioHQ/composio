'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #fff; color: #171414; }
              .ge-heading { color: rgba(0,0,0,0.1); }
              .ge-muted { color: #666; }
              .ge-btn-primary { background: #171414; color: #fff; border: none; }
              .ge-btn-secondary { background: #fff; color: #171414; border: 1px solid #e5e0df; }
              @media (prefers-color-scheme: dark) {
                body { background: #131211; color: #e8e4e0; }
                .ge-heading { color: rgba(255,255,255,0.1); }
                .ge-muted { color: #a8a29e; }
                .ge-btn-primary { background: #e8e4e0; color: #1a1815; }
                .ge-btn-secondary { background: #1e1d1c; color: #e8e4e0; border-color: #2c2a28; }
              }
            `,
          }}
        />
      </head>
      <body>
        <div style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <h1 className="ge-heading" style={{ fontSize: '6rem', fontWeight: 700, letterSpacing: '-0.05em', margin: 0, lineHeight: 1 }}>
            500
          </h1>
          <div style={{ marginTop: '0.5rem', textAlign: 'center', maxWidth: '28rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
              Something went wrong
            </h2>
            <p className="ge-muted" style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
              An unexpected error occurred. Try again or head back to the docs.
            </p>
          </div>
          <div style={{ marginTop: '2rem', display: 'flex', gap: '0.75rem' }}>
            <button
              className="ge-btn-primary"
              onClick={reset}
              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 500, borderRadius: '0.5rem', cursor: 'pointer' }}
            >
              Try again
            </button>
            <a
              className="ge-btn-secondary"
              href="/"
              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 500, borderRadius: '0.5rem', textDecoration: 'none' }}
            >
              Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
