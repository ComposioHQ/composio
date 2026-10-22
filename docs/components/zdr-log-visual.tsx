import { EyeOff } from 'lucide-react';

const LOGO_CDN = 'https://logos.composio.dev/api';

const PAYLOADS: { label: string; lines: [string, string][] }[] = [
  {
    label: 'request',
    lines: [
      ['recipient_email', '"maya@example.com"'],
      ['subject', '"Q3 renewal terms"'],
      ['body', '"Hi Maya, the updated terms are…"'],
    ],
  },
  {
    label: 'response',
    lines: [
      ['id', '"18f2c9a1e4b7"'],
      ['labelIds', '["SENT"]'],
    ],
  },
];

/**
 * ZdrLogVisual — a Gmail tool call's execution log as Zero Data Retention
 * switches on. The request and response dissolve to "not stored" while the
 * tool, status, and latency stay, mirroring the dashboard's ZDR upgrade screen.
 * Server component, light/dark via fd-* tokens. The loop is CSS in global.css
 * (`zdr-log-*`) and holds the ZDR-on state under reduced motion.
 */
export function ZdrLogVisual() {
  return (
    <figure className="not-prose my-6">
      <div
        aria-hidden="true"
        className="mx-auto w-full max-w-[420px] overflow-hidden rounded-sm border border-fd-border bg-fd-background font-mono"
      >
        {/* tool row */}
        <div className="flex items-center gap-2 border-b border-fd-border px-3 py-2.5">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-fd-border">
            <img
              alt=""
              className="size-[15px] object-contain"
              draggable={false}
              src={`${LOGO_CDN}/gmail`}
            />
          </span>
          <code className="truncate text-[12px] font-medium text-fd-foreground">
            GMAIL_SEND_EMAIL
          </code>
          <span className="ml-auto rounded-sm bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-600 dark:text-green-400">
            200
          </span>
          <span className="text-[10px] text-fd-foreground/45">412 ms</span>
        </div>

        {/* metadata that ZDR keeps */}
        <div className="flex gap-1.5 px-3 pt-3 text-[10px] text-fd-foreground/45">
          <span>production</span>
          <span>·</span>
          <span>user_7f3a</span>
          <span>·</span>
          <span>just now</span>
        </div>

        {/* payloads that ZDR drops */}
        <div className="space-y-3 px-3 pb-3 pt-3">
          {PAYLOADS.map((payload) => (
            <div key={payload.label}>
              <span className="mb-1.5 block text-[9px] uppercase tracking-[0.06em] text-fd-foreground/40">
                {payload.label}
              </span>
              <div className="grid">
                <div className="zdr-log-payload col-start-1 row-start-1 border border-fd-border bg-fd-card px-2.5 py-2 text-[11px] leading-[18px]">
                  {payload.lines.map(([key, value]) => (
                    <div key={key} className="truncate">
                      <span className="text-fd-foreground/45">{key}: </span>
                      <span className="text-fd-foreground">{value}</span>
                    </div>
                  ))}
                </div>
                <div className="zdr-log-not-stored zdr-log-hatch col-start-1 row-start-1 flex items-center justify-center gap-1.5 border border-dashed border-fd-border text-[11px] text-fd-foreground/60">
                  <EyeOff className="size-3.5" />
                  not stored
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* the ZDR switch */}
        <div className="flex items-center gap-2 border-t border-fd-border px-3 py-2.5">
          <span className="text-[11px] text-fd-foreground">
            Zero Data Retention
          </span>
          <span className="ml-auto grid text-[10px]">
            <span className="zdr-log-state-off col-start-1 row-start-1 text-right text-fd-foreground/45">
              off
            </span>
            <span className="zdr-log-state-on col-start-1 row-start-1 text-right text-[var(--composio-brand)]">
              on
            </span>
          </span>
          <span className="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full p-0.5">
            <span className="zdr-log-state-off absolute inset-0 rounded-full bg-fd-foreground/15" />
            <span className="zdr-log-state-on absolute inset-0 rounded-full bg-[var(--composio-brand)]" />
            <span className="zdr-log-thumb relative size-3 rounded-full bg-white shadow-sm" />
          </span>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-[11px] text-fd-foreground/50">
        With ZDR on, the log keeps the tool, status, and latency. The request and
        response are not stored.
      </figcaption>
    </figure>
  );
}
