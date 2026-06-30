'use client';

import { Check, RefreshCw } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';

const LOGO_CDN = 'https://logos.composio.dev/api';

/** Landing /dev accent (`--brand-foryou`). */
const BRAND = '#51a2ff';
/** Landing floating-card shadow. */
const CARD_SHADOW = '0 24px 70px -10px rgba(0,0,0,0.7)';

const CONNECTIONS: { slug: string; name: string; account: string }[] = [
  { slug: 'gmail', name: 'Gmail', account: 'work@acme.com' },
  { slug: 'notion', name: 'Notion', account: 'acme-workspace' },
  { slug: 'github', name: 'GitHub', account: 'acme-bot' },
];

/** Rotating access-token suffixes, so each refresh visibly mints a fresh token. */
const TOKENS = ['9f3a', '2c7d', 'b18e', '6a04', 'd52f'];

/** ms between simulated 30-minute refresh ticks. */
const CYCLE_MS = 4200;

/**
 * Orthogonal elbow connector (the /dev page shape): leave `from`'s right edge
 * horizontally, step vertically at the midpoint, then run horizontally into
 * `to`'s left edge, with rounded corners. Measured relative to the container.
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
 * ConnectionRefreshVisual — Composio's automatic OAuth token refresh, drawn in
 * the landing /dev visual language: bare dark floating cards (#0a0a0a, hairline
 * white borders, JetBrains Mono) wired together with measured SVG elbow
 * connectors in the for-you brand blue. A central refresh node fans out to the
 * user's live connections (Gmail, Notion, GitHub). On every tick (one simulated
 * 30-minute interval) a pulse travels each wire, the access token rotates, and
 * the connection flashes `refreshed` while staying `ACTIVE`. Paths are computed
 * from live geometry so the fanout stays aligned across breakpoints.
 */
export function ConnectionRefreshVisual() {
  const rootRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [paths, setPaths] = useState<string[]>([]);
  const [tick, setTick] = useState(0);
  const [active, setActive] = useState(false);
  const reduce = useReducedMotion();

  const calc = useCallback(() => {
    const root = rootRef.current;
    const hub = hubRef.current;
    if (!root || !hub) return;
    const cr = root.getBoundingClientRect();
    const from = hub.getBoundingClientRect();
    const next: string[] = [];
    for (const ref of cardRefs.current) {
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

  // Only run the refresh loop while on screen.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => setActive(!!e?.isIntersecting),
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!active || reduce) return;
    const id = setInterval(() => setTick((t) => t + 1), CYCLE_MS);
    return () => clearInterval(id);
  }, [active, reduce]);

  return (
    <div className="not-prose my-8 font-mono">
      <div
        ref={rootRef}
        className="relative flex flex-col gap-4 md:block md:h-[320px]"
      >
        {/* ── connector overlay (md and up) ── */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 hidden size-full overflow-visible md:block"
          fill="none"
          style={{ color: BRAND }}
        >
          {paths.map((d, i) => (
            <path
              key={CONNECTIONS[i]?.slug ?? i}
              d={d}
              opacity={0.18}
              stroke="currentColor"
              strokeWidth={1}
            />
          ))}
        </svg>

        {/* ── traveling refresh pulses, re-fired each tick ── */}
        {!reduce &&
          paths.map((d, i) => (
            <motion.span
              key={`${CONNECTIONS[i]?.slug ?? i}-${tick}`}
              aria-hidden="true"
              className="absolute left-0 top-0 z-[1] hidden size-[7px] rounded-full md:block"
              style={{
                offsetPath: `path('${d}')`,
                offsetDistance: '0%',
                offsetRotate: '0deg',
                background: BRAND,
                boxShadow: `0 0 10px 2px ${BRAND}`,
              }}
              initial={{ offsetDistance: '0%', opacity: 0 }}
              animate={{
                offsetDistance: '100%',
                opacity: [0, 1, 1, 0],
              }}
              transition={{ duration: 0.85, delay: i * 0.12, ease: 'easeInOut' }}
            />
          ))}

        {/* ── hub: bare Composio logo ── */}
        <div className="relative z-10 flex justify-center md:absolute md:top-1/2 md:left-0 md:block md:w-[180px] md:-translate-y-1/2">
          <span ref={hubRef} className="inline-flex">
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
          </span>
        </div>

        {/* ── "every 30 min" badge, centered over the wiring ── */}
        <div className="relative z-20 flex justify-center md:absolute md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2">
          <div
            className="inline-flex items-center gap-1.5 rounded-full border bg-fd-background px-3 py-1.5 text-[11px] font-medium shadow-sm"
            style={{
              borderColor: 'color-mix(in srgb, ' + BRAND + ' 35%, transparent)',
              color: BRAND,
            }}
          >
            <motion.span
              className="inline-flex"
              animate={reduce ? undefined : { rotate: tick * 360 }}
              transition={{ duration: 0.85, ease: 'easeInOut' }}
            >
              <RefreshCw aria-hidden="true" className="size-3.5" />
            </motion.span>
            every 30 min
          </div>
        </div>

        {/* ── connection cards ── */}
        <div className="relative z-10 flex flex-col gap-3 md:absolute md:inset-y-0 md:right-0 md:w-[320px] md:justify-center md:gap-4">
          {CONNECTIONS.map((conn, i) => {
            const suffix = TOKENS[(tick + i) % TOKENS.length];
            return (
              <div
                key={conn.slug}
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                className="overflow-hidden border border-white/10 bg-[#0a0a0a]"
                style={{ boxShadow: CARD_SHADOW }}
              >
                <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
                  <span className="flex size-6 items-center justify-center rounded-md bg-white ring-1 ring-white/10">
                    <img
                      alt=""
                      aria-hidden="true"
                      className="size-[15px] object-contain"
                      draggable={false}
                      src={`${LOGO_CDN}/${conn.slug}`}
                    />
                  </span>
                  <span className="text-[12px] text-white/80">{conn.name}</span>
                  <code className="ml-auto text-[10px] text-white/35">
                    {conn.account}
                  </code>
                </div>
                <div className="flex items-center gap-2.5 px-2.5 py-2">
                  <span className="inline-flex items-center gap-1.5 text-[10px] text-green-400">
                    <span className="size-1.5 rounded-full bg-green-400" />
                    ACTIVE
                  </span>
                  {/* token rotates on each refresh */}
                  <code className="text-[11px] text-white/45">
                    oauth&nbsp;&middot;&nbsp;&bull;&bull;&bull;&bull;
                    <motion.span
                      key={suffix}
                      className="text-white/70"
                      initial={reduce ? false : { color: BRAND, opacity: 0.4 }}
                      animate={{ color: 'rgba(255,255,255,0.7)', opacity: 1 }}
                      transition={{ duration: 0.6 }}
                    >
                      {suffix}
                    </motion.span>
                  </code>
                  {/* refreshed flash, keyed to the tick */}
                  <motion.span
                    key={`flash-${conn.slug}-${tick}`}
                    aria-hidden="true"
                    className="ml-auto inline-flex items-center gap-1 text-[10px] text-green-400"
                    initial={reduce ? false : { opacity: 0, y: -2 }}
                    animate={
                      reduce
                        ? { opacity: 1 }
                        : { opacity: [0, 1, 1, 0], y: 0 }
                    }
                    transition={{
                      duration: 1.6,
                      delay: 0.7 + i * 0.12,
                      times: [0, 0.15, 0.7, 1],
                    }}
                  >
                    <Check className="size-3" />
                    refreshed
                  </motion.span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* plain caption — page text, no box */}
      <p className="mt-6 text-center text-[10px] text-fd-foreground/45">
        Composio rotates every connection&rsquo;s token on a schedule{' '}
        <span aria-hidden="true" style={{ color: BRAND }}>
          →
        </span>{' '}
        connections stay <span className="text-green-400">ACTIVE</span> with no
        work from you
      </p>
    </div>
  );
}
