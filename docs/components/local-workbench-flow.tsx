import { FileCode2, Boxes, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';

const LOGO_CDN = 'https://logos.composio.dev/api';

/**
 * LocalWorkbenchFlow: branded replacement for the plain `host → sandbox → tools`
 * mermaid diagram on the local-workbench PR reviewer page.
 *
 * Reads left-to-right as the split that defines a local workbench: the Host
 * creates a session with code execution turned off and starts a
 * sandbox you own; the Sandbox runs the reviewer, calling run_composio_tool
 * back out for each GitHub action; Composio resolves and executes those tool
 * calls under the user's connection and returns results. Tool execution lives
 * in your box; discovery and auth stay managed.
 *
 * Server component, no client JS. Adapts to light/dark via fd-* tokens.
 */
export function LocalWorkbenchFlow() {
  return (
    <div className="not-prose my-6 overflow-hidden rounded-sm border border-fd-border bg-fd-background">
      {/* header strip: mono, matches the other branded flow visuals */}
      <div className="flex items-center justify-between border-b border-fd-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-fd-foreground/45">
        <span>local-sandbox.runtime</span>
        <span className="inline-flex items-center gap-1.5 text-fd-foreground/55">
          <span className="relative inline-flex">
            <span className="size-1.5 rounded-full bg-[var(--composio-brand)]" />
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--composio-brand)] opacity-60" />
          </span>
          code runs in your box
        </span>
      </div>

      <div className="grid items-stretch gap-px bg-fd-border md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,1.05fr)]">
        {/* ── Host ───────────────────────────────────────────────── */}
        <Column>
          <Lane label="Host" />
          <div className="flex flex-1 items-center">
            <div className="w-full border border-fd-border bg-fd-card p-3">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-sm bg-fd-foreground/[0.06] text-fd-foreground/70">
                  <FileCode2 aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-medium leading-tight text-fd-foreground">
                    Your orchestrator
                  </div>
                  <div className="truncate font-mono text-[10px] text-fd-foreground/45">
                    src/runner.ts
                  </div>
                </div>
              </div>
              <p className="mt-2.5 text-[11px] leading-snug text-fd-foreground/55">
                Creates the session with{' '}
                <code className="font-mono text-[10px] text-fd-foreground/70">workbench.enable: false</code>, then
                starts a sandbox you own.
              </p>
              <p className="mt-2.5 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--composio-brand)]">
                helper + env <Arrow /> sandbox
              </p>
            </div>
          </div>
          <Connector />
        </Column>

        {/* ── Sandbox (yours) ────────────────────────────────────── */}
        <Column>
          <Lane label="Sandbox · yours" />
          <div className="flex flex-1 items-center">
            <div className="w-full border border-fd-border bg-fd-card p-3">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-sm bg-fd-foreground/[0.06] text-fd-foreground/70">
                  <Boxes aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-medium leading-tight text-fd-foreground">
                    Reviewer agent
                  </div>
                  <div className="truncate font-mono text-[10px] text-fd-foreground/45">
                    your filesystem + shell
                  </div>
                </div>
              </div>
              <p className="mt-2.5 text-[11px] leading-snug text-fd-foreground/55">
                Clones the PR, installs deps, runs the repo&apos;s real checks, all inside your boundary.
              </p>
              <p className="mt-2.5 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--composio-brand)]">
                run_composio_tool <Arrow /> Composio
              </p>
            </div>
          </div>
          <Connector accent />
        </Column>

        {/* ── Composio (the managed side) ────────────────────────── */}
        <Column>
          <Lane label="Composio" accent />
          <div className="flex flex-1 flex-col">
            <div className="relative flex-1 border border-[var(--composio-brand)]/30 bg-[var(--composio-brand)]/[0.04] p-3">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-[var(--composio-brand)]"
              />
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--composio-brand)]">
                  <Wrench aria-hidden="true" className="size-2.5" />
                  Session
                </span>
                <img
                  alt=""
                  aria-hidden="true"
                  className="size-4 rounded-sm object-contain"
                  draggable={false}
                  src={`${LOGO_CDN}/github`}
                />
              </div>

              <p className="mt-2.5 text-[11px] leading-snug text-fd-foreground/60">
                Resolves the right GitHub action, runs it under the user&apos;s connection, and returns the result
                to the sandbox.
              </p>

              <ul className="mt-2.5 space-y-1 font-mono text-[10px] text-fd-foreground/55">
                <li>· search + schema discovery</li>
                <li>· managed GitHub auth</li>
                <li>· tool execution + result</li>
              </ul>
            </div>
          </div>
        </Column>
      </div>

      {/* footer caption */}
      <div className="border-t border-fd-border px-3 py-2 text-center font-mono text-[10px] text-fd-foreground/45">
        host (session, execution off) <Arrow /> your sandbox (runs checks) <Arrow /> run_composio_tool{' '}
        <Arrow /> Composio (resolve + execute) <Arrow /> grounded PR comment
      </div>
    </div>
  );
}

function Column({ children }: { children: ReactNode }) {
  return <div className="relative flex flex-col gap-2 bg-fd-background p-3">{children}</div>;
}

function Lane({ label, accent = false }: { label: string; accent?: boolean }) {
  return (
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
  );
}

/**
 * Directional connector shown between columns. Horizontal arrow on desktop,
 * hidden on stacked mobile so the flow still reads top-to-bottom.
 */
function Connector({ accent = false }: { accent?: boolean }) {
  const color = accent ? 'bg-[var(--composio-brand)]/40' : 'bg-fd-border';
  const tip = accent ? 'border-l-[var(--composio-brand)]/50' : 'border-l-fd-border';
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-10 hidden md:block"
      style={{ right: '-7px', top: '50%' }}
    >
      <div className="flex items-center">
        <span className={'h-px w-3 ' + color} />
        <span className={'size-0 border-y-[3px] border-l-[5px] border-y-transparent ' + tip} />
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <span aria-hidden="true" className="text-[var(--composio-brand)]">
      {'→'}
    </span>
  );
}
