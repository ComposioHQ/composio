import { Bot, Boxes, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * LocalSandboxBoundary — the motivation diagram for the local sandbox page.
 *
 * Contrasts where code execution sits relative to *your* security boundary:
 * - Remote sandbox: your agent is in your box, but execution happens in
 *   Composio's hosted runtime, outside your boundary.
 * - Local sandbox: both the agent and the sandbox that runs its code stay
 *   inside your boundary; only a managed auth + tool-discovery call crosses out
 *   to Composio.
 *
 * Server component, no client JS. Adapts to light/dark via fd-* tokens, and
 * stacks to a single column on mobile.
 */
export function LocalSandboxBoundary() {
  return (
    <div className="not-prose my-6 overflow-hidden rounded-sm border border-fd-border bg-fd-background">
      <div className="border-b border-fd-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-fd-foreground/45">
        where your code runs, relative to your security boundary
      </div>

      <div className="grid items-stretch gap-px bg-fd-border md:grid-cols-2">
        {/* Remote: execution leaves your boundary */}
        <Panel label="Remote sandbox">
          <Boundary tone="neutral">
            <Node icon={<Bot aria-hidden="true" className="size-4" />} title="Your agent" sub="your box" />
          </Boundary>
          <Seam label="code leaves your box" />
          <OutsideNode
            tone="neutral"
            icon={<Boxes aria-hidden="true" className="size-4" />}
            title="Composio runtime"
            sub="runs your code"
          />
        </Panel>

        {/* Local: execution stays inside your boundary */}
        <Panel label="Local sandbox" accent>
          <Boundary tone="accent">
            <Node icon={<Bot aria-hidden="true" className="size-4" />} title="Your agent" sub="your box" />
            <Node
              icon={<Boxes aria-hidden="true" className="size-4" />}
              title="Local sandbox"
              sub="runs the code"
              accent
            />
          </Boundary>
          <Seam label="auth + tools only" accent />
          <OutsideNode
            tone="accent"
            icon={<Wrench aria-hidden="true" className="size-4" />}
            title="Composio"
            sub="managed auth + discovery"
          />
        </Panel>
      </div>

      <div className="border-t border-fd-border px-3 py-2 text-center font-mono text-[10px] leading-relaxed text-fd-foreground/45">
        remote runs your code outside your boundary · local keeps execution inside, Composio only resolves auth and tools
      </div>
    </div>
  );
}

function Panel({ label, accent = false, children }: { label: string; accent?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 bg-fd-background p-3">
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

function Boundary({ tone, children }: { tone: 'neutral' | 'accent'; children: ReactNode }) {
  const border =
    tone === 'accent' ? 'border-[var(--composio-brand)]/40' : 'border-dashed border-fd-foreground/25';
  return (
    <div
      className={
        'relative flex min-h-[124px] flex-col justify-center rounded-sm border bg-fd-foreground/[0.015] p-2.5 pt-6 ' +
        border
      }
    >
      <span className="absolute left-2 top-1 font-mono text-[9px] uppercase tracking-[0.06em] text-fd-foreground/40">
        your boundary
      </span>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Node({
  icon,
  title,
  sub,
  accent = false,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        'flex items-center gap-2 rounded-sm border bg-fd-card p-2 ' +
        (accent ? 'border-[var(--composio-brand)]/30' : 'border-fd-border')
      }
    >
      <span
        className={
          'flex size-6 shrink-0 items-center justify-center rounded-sm ' +
          (accent
            ? 'bg-[var(--composio-brand)]/10 text-[var(--composio-brand)]'
            : 'bg-fd-foreground/[0.06] text-fd-foreground/70')
        }
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[12px] font-medium leading-tight text-fd-foreground">{title}</div>
        <div className="truncate font-mono text-[10px] text-fd-foreground/45">{sub}</div>
      </div>
    </div>
  );
}

function Seam({ label, accent = false }: { label: string; accent?: boolean }) {
  return (
    <div
      className={
        'flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.05em] ' +
        (accent ? 'text-[var(--composio-brand)]' : 'text-fd-foreground/45')
      }
    >
      <span>{label}</span>
      <span aria-hidden="true">↓</span>
    </div>
  );
}

function OutsideNode({
  tone,
  icon,
  title,
  sub,
}: {
  tone: 'neutral' | 'accent';
  icon: ReactNode;
  title: string;
  sub: string;
}) {
  const accent = tone === 'accent';
  return (
    <div
      className={
        'flex items-center gap-2 rounded-sm border p-2 ' +
        (accent ? 'border-[var(--composio-brand)]/30 bg-[var(--composio-brand)]/[0.04]' : 'border-fd-border bg-fd-card')
      }
    >
      <span
        className={
          'flex size-6 shrink-0 items-center justify-center rounded-sm ' +
          (accent
            ? 'bg-[var(--composio-brand)]/10 text-[var(--composio-brand)]'
            : 'bg-fd-foreground/[0.06] text-fd-foreground/70')
        }
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[12px] font-medium leading-tight text-fd-foreground">{title}</div>
        <div className="truncate font-mono text-[10px] text-fd-foreground/45">{sub}</div>
      </div>
    </div>
  );
}
