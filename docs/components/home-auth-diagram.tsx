'use client';

import { User } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const LOGO_CDN = 'https://logos.composio.dev/api';

const USER_IDENTITY = {
  name: 'Ada Chen',
  userId: 'usr_9x2kLm7',
};

const ACCOUNTS = [
  { slug: 'slack', name: 'Slack', account: 'acme-workspace' },
  { slug: 'gmail', name: 'Gmail', account: 'ada@acme.com' },
  { slug: 'linear', name: 'Linear', account: 'acme' },
];

/**
 * Orthogonal elbow connector — leaves `(sx, sy)` horizontally, steps
 * vertically at the midpoint, then runs horizontally into `(ex, ey)` with
 * rounded corners. Adapted from `connection-refresh-visual.tsx#elbowPath`
 * but taking explicit endpoints so multiple lines out of the same hub can
 * exit at staggered y-coordinates and not visually merge into a single
 * thicker line where they share the initial horizontal run.
 */
function elbowPath(sx: number, sy: number, ex: number, ey: number, r = 8): string {
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
 * Auth-and-context mock for the docs Welcome features grid.
 *
 * One user identity card on the left is wired to three connected-account
 * cards on the right via neutral-grey elbow connectors. Paths are computed
 * from live DOM geometry (getBoundingClientRect + ResizeObserver) so the
 * wires meet the hub and cards precisely at every breakpoint. All surfaces
 * use bg-fd-card so nothing reads as recessed against the mock's own card,
 * and logos render inline without a white swatch behind them.
 *
 * Widths are proportional (`w-[36%]` / `w-[52%]`, capped) rather than fixed,
 * which reserves the remaining ~12% as horizontal run for the elbows at every
 * size. Fixed widths do not work here: this pane is *not* monotonic in the
 * viewport — it is ~404px at 1280px wide but only ~242px at 640px, where the
 * feature grid goes two-column. A fixed pair that fits phones overflows at
 * `sm`, and `ex === sx` collapses every wire into `elbowPath`'s straight-line
 * fallback (the middle one to a zero-length, invisible path). The account
 * label hides by container query for the same reason — viewport breakpoints
 * would gate on the wrong axis.
 */
export function AuthDiagram() {
  const rootRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [paths, setPaths] = useState<string[]>([]);

  const calc = useCallback(() => {
    const root = rootRef.current;
    const hub = hubRef.current;
    if (!root || !hub) return;
    const cr = root.getBoundingClientRect();
    const from = hub.getBoundingClientRect();
    const hubX = from.right - cr.left;
    const hubYCenter = from.top + from.height / 2 - cr.top;
    const targets = cardRefs.current.filter(
      (el): el is HTMLDivElement => Boolean(el)
    );
    // Space the exit points down the hub's right edge (~7px apart for 3
    // targets) so lines leave the hub as three distinct wires instead of
    // stacking on the same y and reading as one thick line before the elbow.
    const STAGGER = 7;
    const next = targets.map((ref, i) => {
      const to = ref.getBoundingClientRect();
      const stagger = (i - (targets.length - 1) / 2) * STAGGER;
      const sy = hubYCenter + stagger;
      const ex = to.left - cr.left;
      const ey = to.top + to.height / 2 - cr.top;
      return elbowPath(hubX, sy, ex, ey);
    });
    setPaths(next);
  }, []);

  useEffect(() => {
    calc();
    // Re-measure once fonts/images settle so the initial paths land on the
    // final card positions instead of pre-load ones.
    const t = window.setTimeout(calc, 120);
    const root = rootRef.current;
    const ro = root ? new ResizeObserver(() => calc()) : null;
    if (root && ro) ro.observe(root);
    // ResizeObserver covers layout changes, but keep the window listener too:
    // RO delivery is throttled in backgrounded documents, so a tab resized
    // while hidden can surface with stale paths. Matches
    // `connection-refresh-visual.tsx`.
    window.addEventListener('resize', calc);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', calc);
      ro?.disconnect();
    };
  }, [calc]);

  return (
    <div
      ref={rootRef}
      className="@container relative flex h-full w-full items-center justify-between overflow-hidden"
    >
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 h-full w-full text-fd-foreground/30"
        fill="none"
      >
        {paths.map((d, i) => (
          <path
            d={d}
            key={ACCOUNTS[i]?.slug ?? i}
            stroke="currentColor"
            strokeWidth={1}
          />
        ))}
      </svg>

      <div
        ref={hubRef}
        className="relative z-10 flex w-[36%] max-w-36 shrink-0 items-center gap-2 rounded-[6px] border border-fd-border bg-fd-card px-2.5 py-2"
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-fd-muted">
          <User aria-hidden="true" className="size-3.5 text-fd-foreground/60" />
        </span>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-mono text-[11px] text-fd-foreground/85">
            {USER_IDENTITY.name}
          </span>
          <span className="truncate font-mono text-[9.5px] text-fd-foreground/45">
            {USER_IDENTITY.userId}
          </span>
        </div>
      </div>

      <div className="relative z-10 flex w-[52%] max-w-56 shrink-0 flex-col gap-2">
        {ACCOUNTS.map((app, i) => (
          <div
            className="flex w-full items-center gap-2 rounded-[6px] border border-fd-border bg-fd-card px-2.5 py-2"
            key={app.slug}
            ref={el => {
              cardRefs.current[i] = el;
            }}
          >
            <img
              alt=""
              aria-hidden="true"
              className="size-4 shrink-0 object-contain"
              draggable={false}
              src={`${LOGO_CDN}/${app.slug}`}
            />
            <span className="truncate font-mono text-[11px] text-fd-foreground/85">
              {app.name}
            </span>
            <span className="ml-auto hidden truncate font-mono text-[9.5px] text-fd-foreground/45 @[340px]:inline">
              {app.account}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
