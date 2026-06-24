'use client';

import { Radio, RefreshCw, Webhook, Check } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const LOGO_CDN = 'https://logos.composio.dev/api';

const SOURCES: { slug: string; name: string; kind: 'realtime' | 'polling' }[] = [
  { slug: 'github', name: 'GitHub', kind: 'realtime' },
  { slug: 'slack', name: 'Slack', kind: 'realtime' },
  { slug: 'gmail', name: 'Gmail', kind: 'polling' },
];

/**
 * Orthogonal elbow connector (the /dev page shape): leave `from`'s right edge,
 * step vertically at the midpoint, then run into `to`'s left edge, with rounded
 * corners. Measured relative to the container.
 */
function elbowPath(c: DOMRect, from: DOMRect, to: DOMRect, r = 12): string {
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
 * TriggersFlow — branded replacement for the old `triggers-flow.svg` on the
 * Triggers concept page.
 *
 * Connected apps fan into the bare Composio logo (no card, it's the hub), which
 * fans out to the single webhook URL you configure. Realtime sources stream a
 * steady line of packets; the polling source accumulates, then sends a batch.
 * The point the diagram drives home: however an event reaches Composio, there is
 * only *one* destination you configure — your own URL.
 *
 * Client component: connector paths are measured from live geometry so the
 * fanout stays aligned across breakpoints. Packets animate along the paths with
 * SMIL; honors prefers-reduced-motion.
 */
export function TriggersFlow() {
  const rootRef = useRef<HTMLDivElement>(null);
  const appRefs = useRef<(HTMLLIElement | null)[]>([]);
  const hubRef = useRef<HTMLSpanElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const [inPaths, setInPaths] = useState<string[]>([]);
  const [outPath, setOutPath] = useState<string>('');
  const [animate, setAnimate] = useState(true);

  const calc = useCallback(() => {
    const root = rootRef.current;
    const hub = hubRef.current;
    const target = targetRef.current;
    if (!root || !hub || !target) return;
    const cr = root.getBoundingClientRect();
    const hubRect = hub.getBoundingClientRect();
    setInPaths(
      appRefs.current.map((el) =>
        el ? elbowPath(cr, el.getBoundingClientRect(), hubRect) : ''
      )
    );
    setOutPath(elbowPath(cr, hubRect, target.getBoundingClientRect()));
  }, []);

  useEffect(() => {
    calc();
    const t = setTimeout(calc, 120);
    window.addEventListener('resize', calc);
    const root = rootRef.current;
    const ro = root ? new ResizeObserver(() => calc()) : null;
    if (root && ro) ro.observe(root);
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setAnimate(!mq.matches);
    const onMq = () => setAnimate(!mq.matches);
    mq.addEventListener('change', onMq);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', calc);
      ro?.disconnect();
      mq.removeEventListener('change', onMq);
    };
  }, [calc]);

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

      <div
        ref={rootRef}
        className="relative flex flex-col gap-5 p-4 md:block md:h-[300px] md:p-6"
      >
        {/* ── connector overlay (md and up) ── */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 hidden size-full overflow-visible md:block"
          fill="none"
          style={{ color: 'var(--composio-brand)' }}
        >
          {inPaths.map((d, i) => {
            const src = SOURCES[i];
            if (!d || !src) return null;
            const polling = src.kind === 'polling';
            const id = `tf-in-${i}`;
            return (
              <g key={src.slug}>
                <path
                  d={d}
                  id={id}
                  opacity={polling ? 0.25 : 0.2}
                  stroke="currentColor"
                  strokeDasharray={polling ? '3 4' : undefined}
                  strokeWidth={1.25}
                />
                {animate && <Packets pathId={id} kind={src.kind} />}
              </g>
            );
          })}
          {outPath && (
            <g>
              <path d={outPath} id="tf-out" opacity={0.2} stroke="currentColor" strokeWidth={1.25} />
              {animate && <Packets pathId="tf-out" kind="realtime" />}
            </g>
          )}
        </svg>

        {/* ── Connected apps ── */}
        <div className="relative z-10 md:absolute md:top-1/2 md:left-0 md:w-[248px] md:-translate-y-1/2">
          <p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.07em] text-fd-foreground/55">
            Connected apps
          </p>
          <ul className="overflow-hidden rounded-sm border border-fd-border bg-fd-card">
            {SOURCES.map((app, i) => (
              <li
                key={app.slug}
                ref={(el) => {
                  appRefs.current[i] = el;
                }}
                className={
                  'flex items-center gap-2 px-2.5 py-2.5' +
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

        {/* ── Composio (bare logo hub, no card) ── */}
        <div className="relative z-10 flex justify-center md:absolute md:top-1/2 md:left-1/2 md:block md:-translate-x-1/2 md:-translate-y-1/2 md:text-center">
          <span ref={hubRef} className="inline-flex flex-col items-center gap-2">
            <img
              alt="Composio"
              className="h-7 w-auto object-contain dark:hidden"
              draggable={false}
              src="/Composio Logo.svg"
            />
            <img
              alt="Composio"
              className="hidden h-7 w-auto object-contain dark:block"
              draggable={false}
              src="/Composio Logo Dark.svg"
            />
            <span className="max-w-[150px] text-center font-mono text-[9px] uppercase leading-relaxed tracking-[0.05em] text-fd-foreground/40">
              verify · normalize · sign
            </span>
          </span>
        </div>

        {/* ── Your application ── */}
        <div className="relative z-10 md:absolute md:top-1/2 md:right-0 md:w-[248px] md:-translate-y-1/2">
          <p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.07em] text-fd-foreground/55">
            Your application
          </p>
          <div ref={targetRef} className="border border-fd-border bg-fd-card p-3">
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
      </div>

      {/* footer caption */}
      <div className="border-t border-fd-border px-3 py-2 text-center font-mono text-[10px] text-fd-foreground/45">
        app event <Arrow /> verify, normalize, sign <Arrow /> your one webhook URL
      </div>
    </div>
  );
}

/**
 * Packets traveling along a connector path. Realtime sends a steady stream;
 * polling waits, then fires a single batch (a dot that sits at the source, then
 * zips across).
 */
function Packets({ pathId, kind }: { pathId: string; kind: 'realtime' | 'polling' }) {
  if (kind === 'polling') {
    return (
      <circle fill="currentColor" r={2.5}>
        <animateMotion
          calcMode="linear"
          dur="3s"
          keyPoints="0;0;1;1"
          keyTimes="0;0.72;0.92;1"
          repeatCount="indefinite"
        >
          <mpath href={`#${pathId}`} />
        </animateMotion>
        <animate
          attributeName="r"
          dur="3s"
          keyTimes="0;0.6;0.72;0.92;1"
          repeatCount="indefinite"
          values="1.2;3.2;3.2;2.4;1.2"
        />
      </circle>
    );
  }
  return (
    <>
      {[0, 0.66, 1.33].map((begin) => (
        <circle key={begin} fill="currentColor" r={2}>
          <animateMotion begin={`${begin}s`} dur="2s" repeatCount="indefinite">
            <mpath href={`#${pathId}`} />
          </animateMotion>
        </circle>
      ))}
    </>
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

function Arrow() {
  return (
    <span aria-hidden="true" className="text-[var(--composio-brand)]">
      {'→'}
    </span>
  );
}
