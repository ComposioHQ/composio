import { KeyRound, Link2, Play, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

const STEPS: {
  n: string;
  icon: ReactNode;
  title: string;
  note: string;
}[] = [
  {
    n: '01',
    icon: <KeyRound className="size-3.5" aria-hidden="true" />,
    title: 'Create auth config',
    note: 'Define the scheme for the toolkit you import into',
  },
  {
    n: '02',
    icon: <Link2 className="size-3.5" aria-hidden="true" />,
    title: 'Create the connection',
    note: 'Pass your existing API key or bearer token',
  },
  {
    n: '03',
    icon: <Play className="size-3.5" aria-hidden="true" />,
    title: 'Use it in a session',
    note: 'The connected account is active immediately',
  },
  {
    n: '04',
    icon: <RefreshCw className="size-3.5" aria-hidden="true" />,
    title: 'Update when it rotates',
    note: 'PATCH new credentials in place, no re-auth',
  },
];

/**
 * ImportConnectionFlow — branded replacement for the import pipeline mermaid
 * diagram on the "Importing existing connections" page.
 *
 * Four steps to bring credentials you already hold into Composio without
 * making users re-authenticate: define the auth config, create the connection
 * with the existing credential, use it, and patch it when it rotates. Server
 * component, light/dark via fd-* tokens.
 */
export function ImportConnectionFlow() {
  return (
    <div className="not-prose my-6 overflow-hidden rounded-sm border border-fd-border bg-fd-background">
      {/* header strip */}
      <div className="flex items-center justify-between border-b border-fd-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-fd-foreground/45">
        <span>connection.import</span>
        <span className="text-fd-foreground/55">no re-authentication</span>
      </div>

      {/* the pipeline */}
      <div className="grid items-stretch gap-px bg-fd-border md:grid-cols-4">
        {STEPS.map((step, i) => {
          const last = i === STEPS.length - 1;
          return (
            <div
              key={step.title}
              className="relative flex flex-col gap-2 bg-fd-background p-3"
            >
              <div className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-fd-foreground/[0.06] font-mono text-[10px] font-medium text-fd-foreground/55">
                  {step.n}
                </span>
                <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-[var(--composio-brand)]/10 text-[var(--composio-brand)]">
                  {step.icon}
                </span>
              </div>
              <div className="min-w-0">
                <span className="block text-[12px] font-medium leading-tight text-fd-foreground">
                  {step.title}
                </span>
                <p className="mt-1 text-[11px] leading-snug text-fd-foreground/55">
                  {step.note}
                </p>
              </div>
              {!last && <Connector />}
            </div>
          );
        })}
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
