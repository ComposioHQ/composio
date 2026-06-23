import { Check } from 'lucide-react';

const LOGO_CDN = 'https://logos.composio.dev/api';

const USERS: {
  id: string;
  label: string;
  accounts: { name: string; ca: string }[];
}[] = [
  {
    id: 'user_1',
    label: 'user_1',
    accounts: [
      { name: 'Work Gmail', ca: 'ca_1a2b3c' },
      { name: 'Personal Gmail', ca: 'ca_4d5e6f' },
    ],
  },
  {
    id: 'user_2',
    label: 'user_2',
    accounts: [{ name: 'Gmail', ca: 'ca_7g8h9i' }],
  },
];

/**
 * AuthConfigFlow — branded replacement for the `auth config → connected
 * accounts` mermaid diagram on the Authentication page.
 *
 * One auth config is a single blueprint that every user authenticates against.
 * Each user gets their own connected account (or several), fully isolated from
 * other users. The diagram makes that one-to-many fanout, and the per-user
 * isolation, legible. Server component, light/dark via fd-* tokens.
 */
export function AuthConfigFlow() {
  return (
    <div className="not-prose my-6 overflow-hidden rounded-sm border border-fd-border bg-fd-background">
      {/* header strip */}
      <div className="flex items-center justify-between border-b border-fd-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-fd-foreground/45">
        <span>gmail.auth_config</span>
        <span className="text-fd-foreground/55">one blueprint, many accounts</span>
      </div>

      <div className="grid items-stretch gap-px bg-fd-border md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        {/* ── The blueprint ─────────────────────────────────────── */}
        <div className="relative flex flex-col bg-fd-background p-3">
          <Lane label="Auth config" accent />
          <div className="mt-2 flex flex-1 items-center">
            <div className="relative w-full border border-[var(--composio-brand)]/30 bg-[var(--composio-brand)]/[0.04] p-3">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-[var(--composio-brand)]"
              />
              <div className="flex items-center gap-2">
                <img
                  alt=""
                  aria-hidden="true"
                  className="size-4 object-contain"
                  draggable={false}
                  src={`${LOGO_CDN}/gmail`}
                />
                <code className="font-mono text-[12px] font-medium text-fd-foreground">
                  ac_gmail_oauth2
                </code>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-fd-foreground/60">
                One OAuth2 blueprint: auth method, scopes, and credentials.
                Reused for every user who connects Gmail.
              </p>
            </div>
          </div>
          <Connector accent />
        </div>

        {/* ── The connected accounts, per user ──────────────────── */}
        <div className="flex flex-col bg-fd-background p-3">
          <Lane label="Connected accounts" />
          <ul className="mt-2 flex flex-1 flex-col gap-2">
            {USERS.map((user) => (
              <li
                key={user.id}
                className="overflow-hidden rounded-sm border border-fd-border bg-fd-card"
              >
                <div className="flex items-center gap-2 border-b border-fd-border px-2.5 py-1.5">
                  <span className="flex size-5 items-center justify-center rounded-full bg-[var(--composio-brand)]/12 font-mono text-[10px] font-medium text-[var(--composio-brand)]">
                    U
                  </span>
                  <code className="font-mono text-[11px] text-fd-foreground">
                    {user.label}
                  </code>
                </div>
                <ul className="flex flex-col">
                  {user.accounts.map((acct, i) => (
                    <li
                      key={acct.ca}
                      className={
                        'flex items-center gap-2 px-2.5 py-1.5' +
                        (i < user.accounts.length - 1
                          ? ' border-b border-fd-border'
                          : '')
                      }
                    >
                      <img
                        alt=""
                        aria-hidden="true"
                        className="size-3.5 object-contain"
                        draggable={false}
                        src={`${LOGO_CDN}/gmail`}
                      />
                      <span className="text-[11px] text-fd-foreground/75">
                        {acct.name}
                      </span>
                      <code className="ml-auto font-mono text-[10px] text-fd-foreground/45">
                        {acct.ca}
                      </code>
                      <Check
                        aria-hidden="true"
                        className="size-3 text-[var(--composio-brand)]"
                      />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* footer caption */}
      <div className="border-t border-fd-border px-3 py-2 text-center font-mono text-[10px] text-fd-foreground/45">
        one auth config <Arrow /> a connected account per user, fully isolated
      </div>
    </div>
  );
}

function Lane({ label, accent = false }: { label: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={
          'size-1.5 rounded-full ' +
          (accent ? 'bg-[var(--composio-brand)]' : 'bg-fd-foreground/30')
        }
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
