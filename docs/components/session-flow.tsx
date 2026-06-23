import { Check, Search, Plug, Terminal, Zap } from 'lucide-react';
import type { ReactNode } from 'react';

const LOGO_CDN = 'https://logos.composio.dev/api';

const CONNECTED_APPS: { slug: string; name: string }[] = [
  { slug: 'gmail', name: 'Gmail' },
  { slug: 'github', name: 'GitHub' },
  { slug: 'slack', name: 'Slack' },
];

const META_TOOLS: { icon: ReactNode; label: string; verb: string }[] = [
  { icon: <Search className="size-3" aria-hidden="true" />, label: 'Search tools', verb: 'discover' },
  { icon: <Plug className="size-3" aria-hidden="true" />, label: 'Manage connections', verb: 'authenticate' },
  { icon: <Zap className="size-3" aria-hidden="true" />, label: 'Execute tool', verb: 'act' },
  { icon: <Terminal className="size-3" aria-hidden="true" />, label: 'Sandbox', verb: 'compute' },
];

/**
 * SessionFlow — branded replacement for the plain `agent → session → meta tools`
 * mermaid diagram on the "What is a session?" docs page.
 *
 * Reads left-to-right as a story: your agent acts for a user; the session is the
 * brand-accented runtime context that binds that user's connected accounts + auth
 * and exposes meta tools the agent calls to discover, authenticate, and execute.
 *
 * The centerpiece is the Session card, which surfaces the *user and their
 * connected accounts* — the part the old mermaid diagram never showed.
 * Server component, no client JS. Adapts to light/dark via fd-* tokens.
 */
export function SessionFlow() {
  return (
    <div className="not-prose my-6 overflow-hidden rounded-sm border border-fd-border bg-fd-background">
      {/* header strip — mono, matches the home-feature visuals */}
      <div className="flex items-center justify-between border-b border-fd-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-fd-foreground/45">
        <span>session.runtime</span>
        <span className="inline-flex items-center gap-1.5 text-fd-foreground/55">
          <span className="relative inline-flex">
            <span className="size-1.5 rounded-full bg-[var(--composio-brand)]" />
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--composio-brand)] opacity-60" />
          </span>
          scoped to user
        </span>
      </div>

      <div className="grid items-stretch gap-px bg-fd-border md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.3fr)_minmax(0,1.05fr)]">
        {/* ── Your agent ─────────────────────────────────────────── */}
        <Column>
          <Lane label="Your agent" />
          <div className="flex flex-1 items-center">
            <div className="w-full border border-fd-border bg-fd-card p-3">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-sm bg-fd-foreground/[0.06] font-mono text-[13px] text-fd-foreground/70">
                  {'{ }'}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-medium leading-tight text-fd-foreground">
                    AI agent
                  </div>
                  <div className="truncate font-mono text-[10px] text-fd-foreground/45">
                    acts for one user
                  </div>
                </div>
              </div>
              <p className="mt-2.5 text-[11px] leading-snug text-fd-foreground/55">
                Calls the session&apos;s meta tools instead of loading hundreds of
                tool definitions.
              </p>
            </div>
          </div>
          <Connector />
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
                  runtime context
                </span>
                <span className="font-mono text-[10px] text-fd-foreground/45">
                  usr_9x2kLm7
                </span>
              </div>

              {/* The user + their connected accounts — the missing piece */}
              <div className="mt-2.5 overflow-hidden rounded-sm border border-fd-border bg-fd-card">
                <div className="flex items-center gap-2 border-b border-fd-border px-2.5 py-1.5">
                  <span className="flex size-5 items-center justify-center rounded-full bg-[var(--composio-brand)]/12 font-mono text-[10px] font-medium text-[var(--composio-brand)]">
                    U
                  </span>
                  <span className="text-[11px] font-medium text-fd-foreground">
                    Your user
                  </span>
                  <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.05em] text-fd-foreground/40">
                    connected accounts
                  </span>
                </div>
                <ul className="flex flex-col">
                  {CONNECTED_APPS.map((app, i) => (
                    <li
                      key={app.slug}
                      className={
                        'flex items-center gap-2 px-2.5 py-1.5' +
                        (i < CONNECTED_APPS.length - 1
                          ? ' border-b border-fd-border'
                          : '')
                      }
                    >
                      <img
                        alt=""
                        aria-hidden="true"
                        className="size-3.5 object-contain"
                        draggable={false}
                        src={`${LOGO_CDN}/${app.slug}`}
                      />
                      <span className="text-[11px] text-fd-foreground/75">
                        {app.name}
                      </span>
                      <span className="ml-auto inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--composio-brand)]">
                        <Check aria-hidden="true" className="size-2.5" />
                        linked
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="mt-2.5 text-[11px] leading-snug text-fd-foreground/60">
                Ties the user, toolkits, auth, and connected accounts into one
                scoped environment.
              </p>
            </div>
          </div>
          <Connector accent />
        </Column>

        {/* ── Meta tools ─────────────────────────────────────────── */}
        <Column>
          <Lane label="Meta tools" />
          <div className="flex flex-1 items-stretch">
            <ul className="grid w-full grid-cols-2 gap-1.5 md:grid-cols-1">
              {META_TOOLS.map((tool) => (
                <li
                  key={tool.label}
                  className="flex items-center gap-2 border border-fd-border bg-fd-card px-2.5 py-1.5"
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-[var(--composio-brand)]/10 text-[var(--composio-brand)]">
                    {tool.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-medium leading-tight text-fd-foreground">
                      {tool.label}
                    </span>
                    <span className="block truncate font-mono text-[9px] uppercase tracking-[0.05em] text-fd-foreground/40">
                      {tool.verb}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Column>
      </div>

      {/* footer caption */}
      <div className="border-t border-fd-border px-3 py-2 text-center font-mono text-[10px] text-fd-foreground/45">
        agent <Arrow /> session (user + auth + connections) <Arrow /> discover,
        authenticate, execute
      </div>
    </div>
  );
}

function Column({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex flex-col gap-2 bg-fd-background p-3">
      {children}
    </div>
  );
}

function Lane({ label, accent = false }: { label: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={
          'size-1.5 rounded-full ' +
          (accent ? 'bg-[var(--composio-brand)]' : 'bg-fd-foreground/30')
        }
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
 * vertical on stacked mobile so the flow still reads top-to-bottom.
 */
function Connector({ accent = false }: { accent?: boolean }) {
  const color = accent ? 'bg-[var(--composio-brand)]/40' : 'bg-fd-border';
  const tip = accent
    ? 'border-l-[var(--composio-brand)]/50'
    : 'border-l-fd-border';
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-10 hidden md:block"
      style={{ right: '-7px', top: '50%' }}
    >
      <div className="flex items-center">
        <span className={'h-px w-3 ' + color} />
        <span
          className={
            'size-0 border-y-[3px] border-l-[5px] border-y-transparent ' + tip
          }
        />
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
