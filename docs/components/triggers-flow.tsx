import { Radio, RefreshCw, Webhook, Check } from 'lucide-react';
import type { ReactNode } from 'react';

const LOGO_CDN = 'https://logos.composio.dev/api';

const SOURCES: { slug: string; name: string; kind: 'realtime' | 'polling' }[] = [
  { slug: 'github', name: 'GitHub', kind: 'realtime' },
  { slug: 'slack', name: 'Slack', kind: 'realtime' },
  { slug: 'gmail', name: 'Gmail', kind: 'polling' },
];

/**
 * TriggersFlow — branded replacement for the old `triggers-flow.svg` on the
 * Triggers concept page.
 *
 * Reads left-to-right as the trigger story the docs now tell: an event happens
 * in a connected app; Composio learns about it in real time (provider push) or
 * by polling, then verifies, normalizes, signs, and delivers it. The key point
 * the diagram drives home is that there is only *one* destination you configure
 * — your own webhook URL — no matter which kind of trigger fired.
 *
 * Server component, no client JS. Adapts to light/dark via fd-* tokens.
 */
export function TriggersFlow() {
  return (
    <div className="not-prose my-6 overflow-hidden rounded-sm border border-fd-border bg-fd-background">
      {/* header strip */}
      <div className="flex items-center justify-between border-b border-fd-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-fd-foreground/45">
        <span>triggers.delivery</span>
        <span className="inline-flex items-center gap-1.5 text-fd-foreground/55">
          <span className="relative inline-flex">
            <span className="size-1.5 rounded-full bg-[var(--composio-brand)]" />
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--composio-brand)] opacity-60" />
          </span>
          one webhook URL
        </span>
      </div>

      <div className="grid items-stretch gap-px bg-fd-border md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,1fr)]">
        {/* ── Connected apps ─────────────────────────────────────── */}
        <Column>
          <Lane label="Connected apps" />
          <div className="flex flex-1 items-center">
            <ul className="w-full overflow-hidden rounded-sm border border-fd-border bg-fd-card">
              {SOURCES.map((app, i) => (
                <li
                  key={app.slug}
                  className={
                    'flex items-center gap-2 px-2.5 py-2' +
                    (i < SOURCES.length - 1 ? ' border-b border-fd-border' : '')
                  }
                >
                  <img
                    alt=""
                    aria-hidden="true"
                    className="size-4 object-contain"
                    draggable={false}
                    src={`${LOGO_CDN}/${app.slug}`}
                  />
                  <span className="text-[12px] text-fd-foreground/80">{app.name}</span>
                  <KindTag kind={app.kind} />
                </li>
              ))}
            </ul>
          </div>
          <Connector />
        </Column>

        {/* ── Composio (the hub) ─────────────────────────────────── */}
        <Column>
          <Lane label="Composio" accent />
          <div className="flex flex-1 flex-col">
            <div className="relative flex flex-1 flex-col items-center justify-center gap-3 border border-[var(--composio-brand)]/30 bg-[var(--composio-brand)]/[0.04] p-4">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-[var(--composio-brand)]"
              />
              <img
                alt="Composio"
                className="h-6 w-auto object-contain dark:hidden"
                draggable={false}
                src="/Composio Logo.svg"
              />
              <img
                alt="Composio"
                className="hidden h-6 w-auto object-contain dark:block"
                draggable={false}
                src="/Composio Logo Dark.svg"
              />
              <p className="text-center text-[11px] leading-snug text-fd-foreground/60">
                Receives the event (provider push or poll), verifies the source,
                normalizes it, and signs it.
              </p>
            </div>
          </div>
          <Connector accent />
        </Column>

        {/* ── Your application ───────────────────────────────────── */}
        <Column>
          <Lane label="Your application" />
          <div className="flex flex-1 items-center">
            <div className="w-full border border-fd-border bg-fd-card p-3">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-sm bg-[var(--composio-brand)]/10 text-[var(--composio-brand)]">
                  <Webhook className="size-3.5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-medium leading-tight text-fd-foreground">
                    Your webhook URL
                  </div>
                  <div className="truncate font-mono text-[10px] text-fd-foreground/45">
                    POST /webhooks/composio
                  </div>
                </div>
              </div>
              <p className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] leading-snug text-fd-foreground/55">
                <Check className="size-3 text-[var(--composio-brand)]" aria-hidden="true" />
                One URL receives every event.
              </p>
            </div>
          </div>
        </Column>
      </div>

      {/* footer caption */}
      <div className="border-t border-fd-border px-3 py-2 text-center font-mono text-[10px] text-fd-foreground/45">
        app event <Arrow /> Composio (verify, normalize, sign) <Arrow /> your one
        webhook URL
      </div>
    </div>
  );
}

function Column({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex flex-col gap-2 bg-fd-background p-3">{children}</div>
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

function KindTag({ kind }: { kind: 'realtime' | 'polling' }) {
  const realtime = kind === 'realtime';
  return (
    <span
      className={
        'ml-auto inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.05em] ' +
        (realtime ? 'text-[var(--composio-brand)]' : 'text-fd-foreground/40')
      }
    >
      {realtime ? (
        <Radio className="size-2.5" aria-hidden="true" />
      ) : (
        <RefreshCw className="size-2.5" aria-hidden="true" />
      )}
      {kind}
    </span>
  );
}

/**
 * Directional connector shown between columns. Horizontal arrow on desktop,
 * hidden on stacked mobile (the grid gap reads top-to-bottom there).
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
        <span
          className={'size-0 border-y-[3px] border-l-[5px] border-y-transparent ' + tip}
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
