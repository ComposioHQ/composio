import { Cpu, Globe, MessageSquare, Terminal } from 'lucide-react';
import type { ReactNode } from 'react';

const LOGO_CDN = 'https://logos.composio.dev/api';

const TOOLS: { slug: string; name: string; where: string; local?: boolean }[] = [
  { slug: 'imessage', name: 'iMessage', where: 'on your Mac', local: true },
  { slug: 'gmail', name: 'Gmail', where: 'catalog' },
  { slug: 'github', name: 'GitHub', where: 'catalog' },
];

/**
 * ImessageFlow — branded diagram for the iMessage example page.
 *
 * Reads left-to-right as one request: you type a prompt (or a trigger fires),
 * the eve agent picks a tool and runs it through a single session, and that
 * session carries both the local iMessage toolkit (running on your Mac) and the
 * rest of the Composio catalog (running remote). The reply ends in a text.
 *
 * Server component, no client JS. Adapts to light/dark via fd-* tokens.
 */
export function ImessageFlow() {
  return (
    <div className="not-prose my-6 overflow-hidden rounded-sm border border-fd-border bg-fd-background">
      {/* header strip — mono, matches the other branded flow visuals */}
      <div className="flex items-center justify-between border-b border-fd-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-fd-foreground/45">
        <span>imessage.runtime</span>
        <span className="inline-flex items-center gap-1.5 text-fd-foreground/55">
          <span className="relative inline-flex">
            <span className="size-1.5 rounded-full bg-[var(--composio-brand)]" />
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--composio-brand)] opacity-60" />
          </span>
          running on your Mac
        </span>
      </div>

      <div className="grid items-stretch gap-px bg-fd-border md:grid-cols-[minmax(0,0.9fr)_minmax(0,0.95fr)_minmax(0,1.3fr)]">
        {/* ── You ────────────────────────────────────────────────── */}
        <Column>
          <Lane label="You" />
          <div className="flex flex-1 items-center">
            <div className="w-full border border-fd-border bg-fd-card p-3">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-sm bg-fd-foreground/[0.06] text-fd-foreground/70">
                  <Terminal aria-hidden="true" className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-medium leading-tight text-fd-foreground">
                    Prompt or trigger
                  </div>
                  <div className="truncate font-mono text-[10px] text-fd-foreground/45">
                    text Shams a summary
                  </div>
                </div>
              </div>
              <p className="mt-2.5 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--composio-brand)]">
                you <Arrow /> eve
              </p>
            </div>
          </div>
          <Connector />
        </Column>

        {/* ── eve agent ──────────────────────────────────────────── */}
        <Column>
          <Lane label="eve agent" />
          <div className="flex flex-1 items-center">
            <div className="w-full border border-fd-border bg-fd-card p-3">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-sm bg-fd-foreground/[0.06] font-mono text-[13px] text-fd-foreground/70">
                  {'{ }'}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-medium leading-tight text-fd-foreground">
                    eve agent
                  </div>
                  <div className="truncate font-mono text-[10px] text-fd-foreground/45">
                    searches + executes
                  </div>
                </div>
              </div>
              <p className="mt-2.5 text-[11px] leading-snug text-fd-foreground/55">
                Picks the tool it needs and runs it through the session.
              </p>
            </div>
          </div>
          <Connector accent />
        </Column>

        {/* ── Session (the hub) ──────────────────────────────────── */}
        <Column>
          <Lane label="Session" accent />
          <div className="flex flex-1 flex-col">
            <div className="relative flex-1 border border-[var(--composio-brand)]/30 bg-[var(--composio-brand)]/[0.04] p-3">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-[var(--composio-brand)]"
              />
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--composio-brand)]">
                  one session
                </span>
                <span className="font-mono text-[10px] text-fd-foreground/45">user_123</span>
              </div>

              {/* The local iMessage toolkit alongside the remote catalog */}
              <ul className="mt-2.5 overflow-hidden rounded-sm border border-fd-border bg-fd-card">
                {TOOLS.map((tool, i) => (
                  <li
                    key={tool.slug}
                    className={
                      'flex items-center gap-2 px-2.5 py-1.5' +
                      (i < TOOLS.length - 1 ? ' border-b border-fd-border' : '')
                    }
                  >
                    {tool.local ? (
                      <MessageSquare
                        aria-hidden="true"
                        className="size-3.5 text-[var(--composio-brand)]"
                      />
                    ) : (
                      <img
                        alt=""
                        aria-hidden="true"
                        className="size-3.5 object-contain"
                        draggable={false}
                        src={`${LOGO_CDN}/${tool.slug}`}
                      />
                    )}
                    <span className="text-[11px] text-fd-foreground/75">{tool.name}</span>
                    <span className="font-mono text-[9px] text-fd-foreground/40">{tool.where}</span>
                    <span
                      className={
                        'ml-auto inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.05em] ' +
                        (tool.local ? 'text-[var(--composio-brand)]' : 'text-fd-foreground/45')
                      }
                    >
                      {tool.local ? (
                        <>
                          <Cpu aria-hidden="true" className="size-2.5" />
                          local
                        </>
                      ) : (
                        <>
                          <Globe aria-hidden="true" className="size-2.5" />
                          remote
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="mt-2.5 text-[11px] leading-snug text-fd-foreground/60">
                Local tools run in-process on your Mac; the rest of the catalog runs
                remote, all from one session.
              </p>
            </div>
          </div>
        </Column>
      </div>

      {/* footer caption */}
      <div className="border-t border-fd-border px-3 py-2 text-center font-mono text-[10px] text-fd-foreground/45">
        prompt <Arrow /> eve <Arrow /> session (local mac tools + remote catalog){' '}
        <Arrow /> text sent
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
 * Desktop-only directional connector shown between columns. On mobile, the
 * stacked columns read top-to-bottom without a connector.
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
