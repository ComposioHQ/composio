import { CornerDownLeft } from 'lucide-react';

const NODES: {
  label: string;
  sub: string;
  edge?: string;
  accent?: boolean;
}[] = [
  { label: 'Your app', sub: 'user starts here' },
  {
    label: 'OAuth toolkit',
    sub: 'Google, GitHub, …',
    edge: 'user connects',
  },
  {
    label: 'yourdomain.com',
    sub: 'your proxy endpoint',
    edge: 'redirects user',
    accent: true,
  },
  {
    label: 'backend.composio.dev',
    sub: 'captures the token',
    edge: 'forwards redirect',
  },
];

/**
 * WhiteLabelFlow — branded replacement for the OAuth redirect-proxy mermaid
 * diagram on the white-labeling pages.
 *
 * Shows the browser redirect hop through your own domain: the user connects,
 * the toolkit redirects to your proxy, your proxy forwards to Composio, and
 * Composio sends the user back to your app. Your domain is brand-accented
 * because it's the white-label point. The proxy never touches the token, only
 * the browser redirect. Server component, light/dark via fd-* tokens.
 */
export function WhiteLabelFlow() {
  return (
    <div className="not-prose my-6 overflow-hidden rounded-sm border border-fd-border bg-fd-background">
      {/* header strip */}
      <div className="flex items-center justify-between border-b border-fd-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-fd-foreground/45">
        <span>oauth.redirect</span>
        <span className="text-fd-foreground/55">browser hops only</span>
      </div>

      {/* the hops */}
      <div className="grid items-stretch gap-px bg-fd-border md:grid-cols-4">
        {NODES.map((node, i) => {
          const last = i === NODES.length - 1;
          return (
            <div
              key={node.label}
              className="relative flex flex-col gap-2 bg-fd-background p-3"
            >
              {/* edge label sits above the node it points into */}
              <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-fd-foreground/40">
                {node.edge ? `→ ${node.edge}` : ' '}
              </span>
              <div className="flex flex-1 items-center">
                <div
                  className={
                    'relative w-full border p-3 ' +
                    (node.accent
                      ? 'border-[var(--composio-brand)]/30 bg-[var(--composio-brand)]/[0.04]'
                      : 'border-fd-border bg-fd-card')
                  }
                >
                  {node.accent && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-[var(--composio-brand)]"
                    />
                  )}
                  <code
                    className={
                      'block truncate font-mono text-[12px] font-medium ' +
                      (node.accent
                        ? 'text-[var(--composio-brand)]'
                        : 'text-fd-foreground')
                    }
                  >
                    {node.label}
                  </code>
                  <span className="mt-1 block truncate font-mono text-[10px] text-fd-foreground/45">
                    {node.sub}
                  </span>
                </div>
              </div>
              {!last && <Connector />}
            </div>
          );
        })}
      </div>

      {/* the return hop */}
      <div className="flex items-center justify-center gap-1.5 border-t border-fd-border px-3 py-2 font-mono text-[10px] text-fd-foreground/50">
        <CornerDownLeft
          aria-hidden="true"
          className="size-3 text-[var(--composio-brand)]"
        />
        Composio redirects the user back to{' '}
        <code className="text-fd-foreground/70">your app</code>. Your proxy
        never sees the token
      </div>
    </div>
  );
}

function Connector() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-10 hidden md:block"
      style={{ right: '-7px', top: '50%' }}
    >
      <div className="flex items-center">
        <span className="h-px w-3 bg-fd-border" />
        <span className="size-0 border-y-[3px] border-l-[5px] border-y-transparent border-l-fd-border" />
      </div>
    </div>
  );
}
