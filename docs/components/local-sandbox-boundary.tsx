import { Bot, Boxes, Wrench } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

/**
 * LocalSandboxBoundary — the motivation diagram for the local sandbox page.
 *
 * Both setups use Composio for auth + tools. The only thing that moves is the
 * sandbox that runs your code: outside your security boundary on remote, inside
 * it on local. The boundary is the only framed box, so "inside vs outside" reads
 * literally; the sandbox row is brand-tinted on both sides so the eye tracks it.
 *
 * Server component, no client JS. Both columns carry the same content weight, so
 * they balance without forced heights. Stacks to one column on mobile.
 */
export function LocalSandboxBoundary() {
  return (
    <div className="not-prose my-6 overflow-hidden rounded-md border border-fd-border bg-fd-background">
      <div className="border-b border-fd-border px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-fd-foreground/45">
        where your code runs, relative to your security boundary
      </div>

      <div className="grid gap-px bg-fd-border md:grid-cols-2">
        {/* Remote: the sandbox runs outside your boundary */}
        <Column label="Remote sandbox">
          <Boundary tone="neutral">
            <Row icon={Bot} title="Your agent" />
          </Boundary>
          <Seam />
          <Outside>
            <Row icon={Boxes} title="Remote sandbox" sub="runs your code" emphasis />
            <Row icon={Wrench} title="Composio" sub="auth + tools" />
          </Outside>
        </Column>

        {/* Local: the sandbox runs inside your boundary */}
        <Column label="Local sandbox" accent>
          <Boundary tone="accent">
            <Row icon={Bot} title="Your agent" />
            <Row icon={Boxes} title="Local sandbox" sub="runs your code" emphasis />
          </Boundary>
          <Seam accent />
          <Outside>
            <Row icon={Wrench} title="Composio" sub="auth + tools" />
          </Outside>
        </Column>
      </div>
    </div>
  );
}

function Column({ label, accent = false, children }: { label: string; accent?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 bg-fd-background p-5">
      <div className="flex items-center gap-2">
        <span
          className={'size-1.5 rounded-full ' + (accent ? 'bg-[var(--composio-brand)]' : 'bg-fd-foreground/30')}
          aria-hidden="true"
        />
        <span
          className={
            'font-mono text-[11px] font-medium uppercase tracking-[0.08em] ' +
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

function Boundary({ tone, children }: { tone: 'neutral' | 'accent'; children: ReactNode }) {
  const border =
    tone === 'accent' ? 'border-[var(--composio-brand)]/35' : 'border-dashed border-fd-foreground/20';
  return (
    <div className={'relative rounded-md border bg-fd-foreground/[0.02] px-3 pb-3 pt-8 ' + border}>
      <span className="absolute left-3 top-2.5 font-mono text-[9px] uppercase tracking-[0.07em] text-fd-foreground/40">
        your boundary
      </span>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Outside({ children }: { children: ReactNode }) {
  return (
    <div>
      <span className="font-mono text-[9px] uppercase tracking-[0.07em] text-fd-foreground/40">
        outside your boundary
      </span>
      <div className="mt-2 flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Row({
  icon: Icon,
  title,
  sub,
  emphasis = false,
}: {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  sub?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        'flex items-center gap-3 rounded-md px-2.5 py-2 ' +
        (emphasis ? 'bg-[var(--composio-brand)]/[0.06] ring-1 ring-inset ring-[var(--composio-brand)]/25' : '')
      }
    >
      <span
        className={
          'flex size-8 shrink-0 items-center justify-center rounded-md ' +
          (emphasis
            ? 'bg-[var(--composio-brand)]/10 text-[var(--composio-brand)]'
            : 'bg-fd-foreground/[0.06] text-fd-foreground/65')
        }
      >
        <Icon aria-hidden className="size-4" />
      </span>
      <div className="min-w-0">
        <div
          className={
            'truncate text-[13px] font-medium leading-tight ' +
            (emphasis ? 'text-[var(--composio-brand)]' : 'text-fd-foreground')
          }
        >
          {title}
        </div>
        {sub && <div className="mt-0.5 truncate font-mono text-[10px] text-fd-foreground/45">{sub}</div>}
      </div>
    </div>
  );
}

function Seam({ accent = false }: { accent?: boolean }) {
  return (
    <div
      className={
        'flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em] ' +
        (accent ? 'text-[var(--composio-brand)]' : 'text-fd-foreground/40')
      }
    >
      <span>auth + tools</span>
      <span aria-hidden="true">↓</span>
    </div>
  );
}
