import { Check, Share2 } from 'lucide-react';
import type { ReactNode } from 'react';

const LOGO_CDN = 'https://logos.composio.dev/api';

const CONNECTIONS: { slug: string; name: string; owner: string; shared?: boolean }[] = [
  { slug: 'slack', name: 'Slack', owner: 'workspace bot', shared: true },
  { slug: 'github', name: 'GitHub', owner: 'Alice' },
  { slug: 'gmail', name: 'Gmail', owner: 'Alice' },
];

/**
 * SlackBotFlow — branded replacement for the plain `slack → server → agent`
 * mermaid diagram on the Slack bot example page.
 *
 * Reads left-to-right as the request loop: a Slack message arrives as a trigger
 * webhook, your server hands it to the Pi agent, and the agent works through a
 * per-user session that pins one shared workspace Slack connection alongside the
 * user's own connected apps. The reply flows back to Slack as the bot.
 *
 * Server component, no client JS. Adapts to light/dark via fd-* tokens.
 */
export function SlackBotFlow() {
  return (
    <div className="not-prose my-6 overflow-hidden rounded-sm border border-fd-border bg-fd-background">
      {/* header strip — mono, matches the other branded flow visuals */}
      <div className="flex items-center justify-between border-b border-fd-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-fd-foreground/45">
        <span>slackbot.runtime</span>
        <span className="inline-flex items-center gap-1.5 text-fd-foreground/55">
          <span className="relative inline-flex">
            <span className="size-1.5 rounded-full bg-[var(--composio-brand)]" />
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--composio-brand)] opacity-60" />
          </span>
          listening in Slack
        </span>
      </div>

      <div className="grid items-stretch gap-px bg-fd-border md:grid-cols-[minmax(0,0.9fr)_minmax(0,0.95fr)_minmax(0,1.3fr)]">
        {/* ── Slack ──────────────────────────────────────────────── */}
        <Column>
          <Lane label="Slack" />
          <div className="flex flex-1 items-center">
            <div className="w-full border border-fd-border bg-fd-card p-3">
              <div className="flex items-center gap-2">
                <img
                  alt=""
                  aria-hidden="true"
                  className="size-7 rounded-sm object-contain p-0.5"
                  draggable={false}
                  src={`${LOGO_CDN}/slack`}
                />
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-medium leading-tight text-fd-foreground">
                    Message
                  </div>
                  <div className="truncate font-mono text-[10px] text-fd-foreground/45">
                    @mention or DM
                  </div>
                </div>
              </div>
              <p className="mt-2.5 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--composio-brand)]">
                trigger <Arrow /> webhook
              </p>
            </div>
          </div>
          <Connector />
        </Column>

        {/* ── Your server / agent ────────────────────────────────── */}
        <Column>
          <Lane label="Your server" />
          <div className="flex flex-1 items-center">
            <div className="w-full border border-fd-border bg-fd-card p-3">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-sm bg-fd-foreground/[0.06] font-mono text-[13px] text-fd-foreground/70">
                  {'{ }'}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-medium leading-tight text-fd-foreground">
                    Pi agent
                  </div>
                  <div className="truncate font-mono text-[10px] text-fd-foreground/45">
                    verifies + loops
                  </div>
                </div>
              </div>
              <p className="mt-2.5 text-[11px] leading-snug text-fd-foreground/55">
                Verifies the webhook signature, then calls the session&apos;s tools.
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
                  scoped to user
                </span>
                <span className="font-mono text-[10px] text-fd-foreground/45">
                  slack:T09:alice
                </span>
              </div>

              {/* The shared workspace connection + the user's own apps */}
              <ul className="mt-2.5 overflow-hidden rounded-sm border border-fd-border bg-fd-card">
                {CONNECTIONS.map((conn, i) => (
                  <li
                    key={conn.slug}
                    className={
                      'flex items-center gap-2 px-2.5 py-1.5' +
                      (i < CONNECTIONS.length - 1 ? ' border-b border-fd-border' : '')
                    }
                  >
                    <img
                      alt=""
                      aria-hidden="true"
                      className="size-3.5 object-contain"
                      draggable={false}
                      src={`${LOGO_CDN}/${conn.slug}`}
                    />
                    <span className="text-[11px] text-fd-foreground/75">{conn.name}</span>
                    <span className="font-mono text-[9px] text-fd-foreground/40">{conn.owner}</span>
                    <span
                      className={
                        'ml-auto inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.05em] ' +
                        (conn.shared ? 'text-[var(--composio-brand)]' : 'text-fd-foreground/45')
                      }
                    >
                      {conn.shared ? (
                        <>
                          <Share2 aria-hidden="true" className="size-2.5" />
                          shared
                        </>
                      ) : (
                        <>
                          <Check aria-hidden="true" className="size-2.5" />
                          linked
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="mt-2.5 text-[11px] leading-snug text-fd-foreground/60">
                Posts to Slack as the workspace bot; acts in every other app as the
                user.
              </p>
            </div>
          </div>
        </Column>
      </div>

      {/* footer caption */}
      <div className="border-t border-fd-border px-3 py-2 text-center font-mono text-[10px] text-fd-foreground/45">
        message <Arrow /> trigger <Arrow /> agent <Arrow /> session (shared slack +
        user apps) <Arrow /> reply
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
 * vertical on stacked mobile so the flow still reads top-to-bottom.
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
