import { Bot, Boxes, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * LocalSandboxBoundary — the motivation diagram for the local sandbox page.
 *
 * Both setups use Composio for auth + tools. The only thing that moves is the
 * sandbox that runs your code:
 * - Remote sandbox: it runs on Composio's side, outside your security boundary.
 * - Local sandbox: it runs inside your boundary; Composio still does auth + tools.
 *
 * The sandbox chip is brand-highlighted on both sides so the eye tracks it
 * crossing the boundary. Server component, no client JS; stacks to one column on
 * mobile and keeps the two columns row-aligned on desktop via fixed slot heights.
 */
export function LocalSandboxBoundary() {
  return (
    <div className="not-prose my-6 overflow-hidden rounded-sm border border-fd-border bg-fd-background">
      <div className="border-b border-fd-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-fd-foreground/45">
        where your code runs, relative to your security boundary
      </div>

      <div className="grid items-stretch gap-px bg-fd-border md:grid-cols-2">
        {/* Remote: the sandbox runs outside your boundary */}
        <Panel label="Remote sandbox">
          <BoundarySlot>
            <Boundary tone="neutral">
              <Node icon={<Bot aria-hidden="true" className="size-4" />} title="Your agent" />
            </Boundary>
          </BoundarySlot>
          <Seam />
          <OutsideSlot>
            <Node
              icon={<Boxes aria-hidden="true" className="size-4" />}
              title="Remote sandbox"
              sub="runs your code"
              emphasis
            />
            <Node icon={<Wrench aria-hidden="true" className="size-4" />} title="Composio" sub="auth + tools" />
          </OutsideSlot>
        </Panel>

        {/* Local: the sandbox runs inside your boundary */}
        <Panel label="Local sandbox" accent>
          <BoundarySlot>
            <Boundary tone="accent">
              <Node icon={<Bot aria-hidden="true" className="size-4" />} title="Your agent" />
              <Node
                icon={<Boxes aria-hidden="true" className="size-4" />}
                title="Local sandbox"
                sub="runs your code"
                emphasis
              />
            </Boundary>
          </BoundarySlot>
          <Seam accent />
          <OutsideSlot>
            <Node icon={<Wrench aria-hidden="true" className="size-4" />} title="Composio" sub="auth + tools" />
          </OutsideSlot>
        </Panel>
      </div>

      <div className="border-t border-fd-border px-3 py-2 text-center font-mono text-[10px] leading-relaxed text-fd-foreground/45">
        only the sandbox moves &middot; remote runs your code outside your boundary, local keeps it inside &middot; Composio
        handles auth and tools either way
      </div>
    </div>
  );
}

function Panel({ label, accent = false, children }: { label: string; accent?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 bg-fd-background p-3">
      <div className="flex items-center gap-1.5">
        <span
          className={'size-1.5 rounded-full ' + (accent ? 'bg-[var(--composio-brand)]' : 'bg-fd-foreground/30')}
          aria-hidden="true"
        />
        <span
          className={
            'font-mono text-[10px] font-medium uppercase tracking-[0.07em] ' +
            (accent ? 'text-[var(--composio-brand)]' : 'text-fd-foreground/55')
          }
        >
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

/** Fixed-height slots keep the two columns' rows aligned across the boundary. */
function BoundarySlot({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[140px]">{children}</div>;
}

function OutsideSlot({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[112px] flex-col justify-center gap-2">{children}</div>;
}

function Boundary({ tone, children }: { tone: 'neutral' | 'accent'; children: ReactNode }) {
  const border =
    tone === 'accent' ? 'border-[var(--composio-brand)]/40' : 'border-dashed border-fd-foreground/25';
  return (
    <div
      className={
        'relative flex flex-1 flex-col justify-center gap-2.5 rounded-sm border bg-fd-foreground/[0.015] p-3 pt-6 ' +
        border
      }
    >
      <span className="absolute left-2 top-1 font-mono text-[9px] uppercase tracking-[0.06em] text-fd-foreground/40">
        your boundary
      </span>
      {children}
    </div>
  );
}

function Node({
  icon,
  title,
  sub,
  emphasis = false,
}: {
  icon: ReactNode;
  title: string;
  sub?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        'flex items-center gap-2 rounded-sm border bg-fd-card p-2 ' +
        (emphasis ? 'border-[var(--composio-brand)]/40 bg-[var(--composio-brand)]/[0.04]' : 'border-fd-border')
      }
    >
      <span
        className={
          'flex size-7 shrink-0 items-center justify-center rounded-sm ' +
          (emphasis
            ? 'bg-[var(--composio-brand)]/10 text-[var(--composio-brand)]'
            : 'bg-fd-foreground/[0.06] text-fd-foreground/70')
        }
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[12px] font-medium leading-tight text-fd-foreground">{title}</div>
        {sub && <div className="truncate font-mono text-[10px] text-fd-foreground/45">{sub}</div>}
      </div>
    </div>
  );
}

function Seam({ accent = false }: { accent?: boolean }) {
  return (
    <div
      className={
        'flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.05em] ' +
        (accent ? 'text-[var(--composio-brand)]' : 'text-fd-foreground/45')
      }
    >
      <span>auth + tools</span>
      <span aria-hidden="true">↓</span>
    </div>
  );
}
