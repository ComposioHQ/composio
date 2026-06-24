'use client';

import { Check } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const LOGO_CDN = 'https://logos.composio.dev/api';

/** Landing /dev accent (`--brand-foryou`). */
const BRAND = '#51a2ff';
/** Landing floating-card shadow. */
const CARD_SHADOW = '0 24px 70px -10px rgba(0,0,0,0.7)';

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
 * Orthogonal elbow connector (the /dev page shape): leave `from`'s right edge
 * horizontally, step vertically at the midpoint, then run horizontally into
 * `to`'s left edge — with rounded corners. Measured relative to the container.
 */
function elbowPath(c: DOMRect, from: DOMRect, to: DOMRect, r = 10): string {
  const sx = from.right - c.left;
  const sy = from.top + from.height / 2 - c.top;
  const ex = to.left - c.left;
  const ey = to.top + to.height / 2 - c.top;
  const midX = sx + (ex - sx) * 0.5;
  const dy = Math.sign(ey - sy) || 1;
  const rr = Math.min(r, Math.abs(ex - sx) / 2, Math.abs(ey - sy) / 2);
  if (rr < 1) return `M ${sx} ${sy} L ${ex} ${ey}`;
  return (
    `M ${sx} ${sy} L ${midX - rr} ${sy} ` +
    `Q ${midX} ${sy} ${midX} ${sy + dy * rr} ` +
    `L ${midX} ${ey - dy * rr} ` +
    `Q ${midX} ${ey} ${midX + rr} ${ey} ` +
    `L ${ex} ${ey}`
  );
}

/**
 * AuthConfigFlow — the `auth config → connected accounts` relationship, drawn in
 * the landing /dev visual language: bare dark floating cards (#0a0a0a, hairline
 * white borders, JetBrains Mono) wired together with measured SVG elbow
 * connectors in the for-you brand blue. One auth config is a single blueprint
 * every user authenticates against; it fans out to a connected account (or
 * several) per user, fully isolated. Paths are computed from live geometry so the
 * fanout stays aligned across breakpoints, and draw in once on scroll.
 */
export function AuthConfigFlow() {
  const rootRef = useRef<HTMLDivElement>(null);
  const blueprintRef = useRef<HTMLDivElement>(null);
  const userRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [paths, setPaths] = useState<string[]>([]);
  const [drawn, setDrawn] = useState(false);

  const calc = useCallback(() => {
    const root = rootRef.current;
    const blueprint = blueprintRef.current;
    if (!root || !blueprint) return;
    const cr = root.getBoundingClientRect();
    const from = blueprint.getBoundingClientRect();
    const next: string[] = [];
    for (const ref of userRefs.current) {
      if (!ref) continue;
      next.push(elbowPath(cr, from, ref.getBoundingClientRect()));
    }
    setPaths(next);
  }, []);

  useEffect(() => {
    calc();
    const t = setTimeout(calc, 120);
    window.addEventListener('resize', calc);
    const root = rootRef.current;
    const ro = root ? new ResizeObserver(() => calc()) : null;
    if (root && ro) ro.observe(root);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', calc);
      ro?.disconnect();
    };
  }, [calc]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) setDrawn(true);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="not-prose my-8 font-mono">
      {/* floating composition — bare dark cards on the page, no outer card */}
      <div
        ref={rootRef}
        className="relative flex flex-col gap-4 md:block md:h-[300px]"
      >
        {/* ── connector overlay (md and up) ── */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 hidden size-full overflow-visible md:block"
          fill="none"
          style={{ color: BRAND }}
        >
          <style>{`
            @keyframes acfDraw { to { stroke-dashoffset: 0; } }
            @media (prefers-reduced-motion: reduce) {
              .acf-draw { animation: none !important; stroke-dashoffset: 0 !important; }
            }
          `}</style>
          {paths.map((d, i) => (
            <g key={USERS[i]?.id ?? i}>
              {/* faint static rail */}
              <path d={d} opacity={0.15} stroke="currentColor" strokeWidth={1} />
              {/* drawn-in accent */}
              <path
                className="acf-draw"
                d={d}
                stroke="currentColor"
                strokeDasharray={600}
                strokeDashoffset={600}
                strokeWidth={1.5}
                style={{
                  animation: drawn
                    ? `acfDraw 0.7s ease-out ${0.15 + i * 0.15}s forwards`
                    : undefined,
                }}
              />
            </g>
          ))}
        </svg>

        {/* ── blueprint node ── */}
        <div className="relative z-10 md:absolute md:top-1/2 md:left-0 md:w-[244px] md:-translate-y-1/2">
          <div
            ref={blueprintRef}
            className="relative overflow-hidden border bg-[#0a0a0a] p-3"
            style={{
              borderColor: 'color-mix(in srgb, ' + BRAND + ' 50%, transparent)',
              boxShadow: CARD_SHADOW,
            }}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 w-[2px]"
              style={{ background: BRAND }}
            />
            <div className="flex items-center gap-2">
              <img
                alt=""
                aria-hidden="true"
                className="size-4 object-contain"
                draggable={false}
                src={`${LOGO_CDN}/gmail`}
              />
              <code className="text-[12px] font-medium text-white/90">
                ac_gmail_oauth2
              </code>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-white/45">
              One OAuth2 blueprint: auth method, scopes, and credentials. Reused
              for every user who connects Gmail.
            </p>
          </div>
        </div>

        {/* ── connected-account nodes, per user ── */}
        <div className="relative z-10 flex flex-col gap-3 md:absolute md:inset-y-0 md:right-0 md:w-[300px] md:justify-center md:gap-5">
          {USERS.map((user, i) => (
            <div
              key={user.id}
              ref={(el) => {
                userRefs.current[i] = el;
              }}
              className="overflow-hidden border border-white/10 bg-[#0a0a0a]"
              style={{ boxShadow: CARD_SHADOW }}
            >
              <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
                <span
                  className="flex size-5 items-center justify-center rounded-full text-[10px]"
                  style={{
                    background:
                      'color-mix(in srgb, ' + BRAND + ' 15%, transparent)',
                    color: BRAND,
                  }}
                >
                  U
                </span>
                <code className="text-[11px] text-white/70">{user.label}</code>
              </div>
              <ul className="flex flex-col">
                {user.accounts.map((acct, j) => (
                  <li
                    key={acct.ca}
                    className={
                      'flex items-center gap-2.5 px-2.5 py-2' +
                      (j < user.accounts.length - 1
                        ? ' border-b border-white/[0.06]'
                        : '')
                    }
                  >
                    <img
                      alt=""
                      aria-hidden="true"
                      className="size-[15px] object-contain"
                      draggable={false}
                      src={`${LOGO_CDN}/gmail`}
                    />
                    <span className="text-[12px] text-white/70">{acct.name}</span>
                    <code className="ml-auto text-[10px] text-white/35">
                      {acct.ca}
                    </code>
                    <Check aria-hidden="true" className="size-4 text-green-400" />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* plain caption — page text, no box */}
      <p className="mt-6 text-center text-[10px] text-fd-foreground/45">
        one auth config{' '}
        <span aria-hidden="true" style={{ color: BRAND }}>
          →
        </span>{' '}
        a connected account per user, fully isolated
      </p>
    </div>
  );
}
