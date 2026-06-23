import { Search, Layers, Terminal, Check } from 'lucide-react';
import type { ReactNode } from 'react';

const STEPS: {
  n: string;
  icon: ReactNode;
  tool: string;
  note: string;
}[] = [
  {
    n: '01',
    icon: <Search className="size-3.5" aria-hidden="true" />,
    tool: 'SEARCH_TOOLS',
    note: 'Discovers the Gmail and Sheets tools',
  },
  {
    n: '02',
    icon: <Layers className="size-3.5" aria-hidden="true" />,
    tool: 'MULTI_EXECUTE',
    note: 'Fetches the unread emails',
  },
  {
    n: '03',
    icon: <Terminal className="size-3.5" aria-hidden="true" />,
    tool: 'REMOTE_WORKBENCH',
    note: 'Classifies, labels, and logs to the sheet in parallel',
  },
];

/**
 * WorkbenchFlow — branded replacement for the meta-tool pipeline mermaid
 * diagram on the Workbench page.
 *
 * Reads as a story: one user request flows through the meta tools, escalating
 * from discovery to bulk execution to the workbench when the task gets too
 * complex for individual calls. The third step is brand-accented because it's
 * the page's subject. Server component, no client JS, light/dark via fd-* tokens.
 */
export function WorkbenchFlow() {
  return (
    <div className="not-prose my-6 overflow-hidden rounded-sm border border-fd-border bg-fd-background">
      {/* header strip */}
      <div className="flex items-center justify-between border-b border-fd-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-fd-foreground/45">
        <span>session.sandbox</span>
        <span className="inline-flex items-center gap-1.5 text-fd-foreground/55">
          <span className="relative inline-flex">
            <span className="size-1.5 rounded-full bg-[var(--composio-brand)]" />
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--composio-brand)] opacity-60" />
          </span>
          meta tools
        </span>
      </div>

      {/* the request */}
      <div className="flex items-start gap-2 border-b border-fd-border px-3 py-2.5">
        <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--composio-brand)]/12 font-mono text-[10px] font-medium text-[var(--composio-brand)]">
          U
        </span>
        <p className="text-[12px] italic leading-snug text-fd-foreground/70">
          &ldquo;Triage my emails, label the urgent ones, and log them to a
          Google Sheet.&rdquo;
        </p>
      </div>

      {/* the pipeline */}
      <div className="grid items-stretch gap-px bg-fd-border md:grid-cols-3">
        {STEPS.map((step, i) => {
          const last = i === STEPS.length - 1;
          return (
            <div
              key={step.tool}
              className="relative flex flex-col gap-2 bg-fd-background p-3"
            >
              <div className="flex items-center gap-2">
                <span
                  className={
                    'flex size-6 shrink-0 items-center justify-center rounded-sm font-mono text-[10px] font-medium ' +
                    (last
                      ? 'bg-[var(--composio-brand)]/12 text-[var(--composio-brand)]'
                      : 'bg-fd-foreground/[0.06] text-fd-foreground/55')
                  }
                >
                  {step.n}
                </span>
                <span
                  className={
                    'flex size-6 shrink-0 items-center justify-center rounded-sm ' +
                    (last
                      ? 'bg-[var(--composio-brand)]/10 text-[var(--composio-brand)]'
                      : 'bg-fd-foreground/[0.04] text-fd-foreground/45')
                  }
                >
                  {step.icon}
                </span>
              </div>
              <div className="min-w-0">
                <code className="block truncate font-mono text-[12px] font-medium text-fd-foreground">
                  {step.tool}
                </code>
                <p className="mt-1 text-[11px] leading-snug text-fd-foreground/55">
                  {step.note}
                </p>
              </div>
              {!last && <Connector />}
            </div>
          );
        })}
      </div>

      {/* footer caption */}
      <div className="flex items-center justify-center gap-1.5 border-t border-fd-border px-3 py-2 font-mono text-[10px] text-fd-foreground/45">
        <Check aria-hidden="true" className="size-3 text-[var(--composio-brand)]" />
        emails triaged, labeled, and logged
      </div>
    </div>
  );
}

/**
 * Directional connector between steps. Horizontal arrow on desktop, hidden on
 * stacked mobile (vertical order already reads top-to-bottom).
 */
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
