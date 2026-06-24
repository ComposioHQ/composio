'use client';

import { Radio, RefreshCw, Webhook, Check } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const LOGO_CDN = 'https://logos.composio.dev/api';

const SOURCES: { slug: string; name: string; kind: 'realtime' | 'polling' }[] = [
  { slug: 'github', name: 'GitHub', kind: 'realtime' },
  { slug: 'slack', name: 'Slack', kind: 'realtime' },
  { slug: 'gmail', name: 'Gmail', kind: 'polling' },
];

const RT_POOL = 5; // concurrent packets per realtime source
const POLL_POOL = 6; // packets that pile up in the polling box per batch
const OUT_POOL = 6; // packets streaming out to your webhook URL

// Polling cadence (seconds): packets fill in, wait, then release together.
const FILL_GAP = 0.45;
const T_RELEASE = 3.0;
const MOVE_DUR = 0.6;
const CYCLE = 3.9;

type Pt = { x: number; y: number };
type InGeom = { spawn: Pt; edge: Pt; end: Pt };
type Geom = { ins: InGeom[]; out: { spawn: Pt; end: Pt } } | null;
type Line = { x1: number; y1: number; x2: number; y2: number; dashed: boolean };

type RtSlot = { active: boolean; p: number; dur: number; wait: number };
type RtState = { slots: RtSlot[] };
type PollState = { t: number; offsets: Pt[] };

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const easeOut = (p: number) => 1 - (1 - p) * (1 - p);

function makeRt(pool: number): RtState {
  return {
    slots: Array.from({ length: pool }, () => ({
      active: false,
      p: 0,
      dur: rand(0.55, 1.0),
      wait: rand(0, 1.3),
    })),
  };
}

function setCircle(el: SVGCircleElement | null, x: number, y: number, op: number, r: number) {
  if (!el) return;
  el.setAttribute('cx', String(x));
  el.setAttribute('cy', String(y));
  el.setAttribute('r', String(r));
  el.style.opacity = String(op);
}

function stepRealtime(state: RtState, pool: (SVGCircleElement | null)[], from: Pt, to: Pt, dt: number) {
  state.slots.forEach((s, k) => {
    if (!s.active) {
      s.wait -= dt;
      if (s.wait <= 0) {
        s.active = true;
        s.p = 0;
        s.dur = rand(0.5, 0.95);
      } else {
        setCircle(pool[k], 0, 0, 0, 0);
        return;
      }
    }
    s.p += dt / s.dur;
    if (s.p >= 1) {
      s.active = false;
      s.wait = rand(0.12, 0.85); // jitter between emissions
      setCircle(pool[k], 0, 0, 0, 0);
      return;
    }
    const e = easeOut(s.p);
    const op = Math.min(1, s.p * 7) * Math.min(1, (1 - s.p) * 7);
    setCircle(pool[k], from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e, op, 2);
  });
}

function stepPolling(state: PollState, pool: (SVGCircleElement | null)[], spawn: Pt, end: Pt, dt: number) {
  state.t += dt;
  if (state.t > CYCLE) state.t -= CYCLE;
  for (let k = 0; k < pool.length; k++) {
    const off = state.offsets[k] ?? { x: 0, y: 0 };
    const sx = spawn.x + off.x;
    const sy = spawn.y + off.y;
    const fillAt = k * FILL_GAP;
    if (state.t < fillAt) {
      setCircle(pool[k], 0, 0, 0, 0); // hasn't arrived in the box yet
    } else if (state.t < T_RELEASE) {
      setCircle(pool[k], sx, sy, 0.9, 2); // waiting inside the box
    } else {
      const mp = (state.t - T_RELEASE) / MOVE_DUR;
      if (mp >= 1) {
        setCircle(pool[k], 0, 0, 0, 0);
      } else {
        const e = easeOut(mp);
        setCircle(pool[k], sx + (end.x - sx) * e, sy + (end.y - sy) * e, 1, 2);
      }
    }
  }
}

/**
 * TriggersFlow — branded flow diagram for the Triggers concept page.
 *
 * Connected apps fan into the bare Composio logo (the hub), which fans out to
 * the single webhook URL you configure. The animation models the actual
 * behavior: realtime sources emit a packet that leaves almost as soon as it
 * appears (with jitter), while the polling source accumulates packets inside
 * its box and releases the whole batch on each poll tick. The point: however an
 * event reaches Composio, there is only one destination you configure.
 *
 * Client component: geometry is measured from live layout; packets are driven
 * by requestAnimationFrame. Honors prefers-reduced-motion (rails only).
 */
export function TriggersFlow() {
  const rootRef = useRef<HTMLDivElement>(null);
  const appRefs = useRef<(HTMLLIElement | null)[]>([]);
  const hubRef = useRef<HTMLSpanElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);

  const geomRef = useRef<Geom>(null);
  const inCircles = useRef<(SVGCircleElement | null)[][]>([[], [], []]);
  const outCircles = useRef<(SVGCircleElement | null)[]>([]);
  const simRef = useRef<{ ins: (RtState | PollState)[]; out: RtState } | null>(null);

  const [rails, setRails] = useState<{ ins: Line[]; out: Line | null }>({ ins: [], out: null });
  const [animate, setAnimate] = useState(true);
  const [pollFiring, setPollFiring] = useState(false);
  const firingRef = useRef(false);

  const poolSize = (kind: 'realtime' | 'polling') => (kind === 'polling' ? POLL_POOL : RT_POOL);

  const calc = useCallback(() => {
    const root = rootRef.current;
    const hub = hubRef.current;
    const target = targetRef.current;
    if (!root || !hub || !target) return;
    const cr = root.getBoundingClientRect();
    const hubR = hub.getBoundingClientRect();
    const tgtR = target.getBoundingClientRect();
    const hubLeft: Pt = { x: hubR.left - cr.left, y: hubR.top - cr.top + hubR.height / 2 };
    const hubRight: Pt = { x: hubR.right - cr.left, y: hubLeft.y };
    const tgtLeft: Pt = { x: tgtR.left - cr.left, y: tgtR.top - cr.top + tgtR.height / 2 };

    const ins: InGeom[] = [];
    const inLines: Line[] = [];
    appRefs.current.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const y = r.top - cr.top + r.height / 2;
      const edge: Pt = { x: r.right - cr.left, y };
      // Spawn inside the card, in the clear right-hand lane (the extra pr on each
      // row), so packets read as coming from the app without covering its label.
      const spawn: Pt = { x: edge.x - 13, y };
      // Fan the convergence points slightly so the lines don't knot at the logo.
      const end: Pt = { x: hubLeft.x - 2, y: hubLeft.y + (i - 1) * 5 };
      ins[i] = { spawn, edge, end };
      inLines[i] = { x1: edge.x, y1: edge.y, x2: end.x, y2: end.y, dashed: SOURCES[i]?.kind === 'polling' };
    });

    geomRef.current = { ins, out: { spawn: hubRight, end: tgtLeft } };
    setRails({ ins: inLines, out: { x1: hubRight.x, y1: hubRight.y, x2: tgtLeft.x, y2: tgtLeft.y, dashed: false } });
  }, []);

  useEffect(() => {
    simRef.current = {
      ins: SOURCES.map((s) =>
        s.kind === 'realtime'
          ? makeRt(RT_POOL)
          : { t: 0, offsets: Array.from({ length: POLL_POOL }, () => ({ x: rand(-6, 3), y: rand(-7, 7) })) }
      ),
      out: makeRt(OUT_POOL),
    };

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

    let raf = 0;
    let last: number | null = null;
    const loop = (ts: number) => {
      if (last === null) last = ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      const geom = geomRef.current;
      const sim = simRef.current;
      if (geom && sim && !mq.matches) {
        SOURCES.forEach((src, i) => {
          const g = geom.ins[i];
          const pool = inCircles.current[i];
          if (!g || !pool) return;
          if (src.kind === 'realtime') stepRealtime(sim.ins[i] as RtState, pool, g.spawn, g.end, dt);
          else stepPolling(sim.ins[i] as PollState, pool, g.spawn, g.end, dt);
        });
        stepRealtime(sim.out, outCircles.current, geom.out.spawn, geom.out.end, dt);

        // Light the polling tag while the batch is firing, with a buffer either side.
        const pollIdx = SOURCES.findIndex((s) => s.kind === 'polling');
        if (pollIdx >= 0) {
          const ps = sim.ins[pollIdx] as PollState;
          const BUF = 0.3;
          const firing = ps.t >= T_RELEASE - BUF && ps.t <= T_RELEASE + MOVE_DUR + BUF;
          if (firing !== firingRef.current) {
            firingRef.current = firing;
            setPollFiring(firing);
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
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

      <div ref={rootRef} className="relative flex flex-col gap-5 p-4 md:block md:h-[300px] md:p-6">
        {/* ── connector + packet overlay (md and up) ── */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 hidden size-full overflow-visible md:block"
          fill="none"
          style={{ color: 'var(--composio-brand)' }}
        >
          {rails.ins.map((l, i) => (
            <line
              key={SOURCES[i]?.slug ?? i}
              opacity={0.18}
              stroke="currentColor"
              strokeDasharray={l.dashed ? '3 4' : undefined}
              strokeWidth={1.25}
              x1={l.x1}
              x2={l.x2}
              y1={l.y1}
              y2={l.y2}
            />
          ))}
          {rails.out && (
            <line opacity={0.18} stroke="currentColor" strokeWidth={1.25} x1={rails.out.x1} x2={rails.out.x2} y1={rails.out.y1} y2={rails.out.y2} />
          )}
          {animate &&
            SOURCES.map((src, i) => (
              <g key={src.slug} fill="currentColor">
                {Array.from({ length: poolSize(src.kind) }).map((_, k) => (
                  <circle
                    key={k}
                    cx={0}
                    cy={0}
                    r={2}
                    ref={(el) => {
                      inCircles.current[i][k] = el;
                    }}
                    style={{ opacity: 0 }}
                  />
                ))}
              </g>
            ))}
          {animate && (
            <g fill="currentColor">
              {Array.from({ length: OUT_POOL }).map((_, k) => (
                <circle
                  key={k}
                  cx={0}
                  cy={0}
                  r={2}
                  ref={(el) => {
                    outCircles.current[k] = el;
                  }}
                  style={{ opacity: 0 }}
                />
              ))}
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
                  'flex items-center gap-2 py-2.5 pl-2.5 pr-6' +
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
                <KindTag kind={app.kind} active={app.kind === 'polling' && pollFiring} />
              </li>
            ))}
          </ul>
        </div>

        {/* ── Composio (bare logo hub, no card) ── */}
        <div className="relative z-10 flex justify-center md:absolute md:top-1/2 md:left-1/2 md:block md:-translate-x-1/2 md:-translate-y-1/2 md:text-center">
          <span ref={hubRef} className="inline-flex flex-col items-center">
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
        app event <Arrow /> Composio <Arrow /> your webhook URL
      </div>
    </div>
  );
}

function KindTag({ kind, active = false }: { kind: 'realtime' | 'polling'; active?: boolean }) {
  const realtime = kind === 'realtime';
  const lit = realtime || active;
  return (
    <span
      className={
        'ml-auto inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.05em] transition-colors duration-300 ' +
        (lit ? 'text-[var(--composio-brand)]' : 'text-fd-foreground/40')
      }
    >
      {realtime ? (
        <Radio className="size-2.5" aria-hidden="true" />
      ) : (
        <RefreshCw className={'size-2.5' + (active ? ' animate-spin' : '')} aria-hidden="true" />
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
