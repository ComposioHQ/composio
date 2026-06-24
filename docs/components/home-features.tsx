import Link from 'next/link';
import { ArrowUpRight, Check } from 'lucide-react';
import type { ReactNode } from 'react';

const LOGO_CDN = 'https://logos.composio.dev/api';
const TOOLKIT_LOGOS = [
  'gmail', 'slack', 'github', 'linear', 'notion', 'figma', 'stripe', 'hubspot',
  'googledrive', 'airtable', 'jira', 'discord', 'zoom', 'asana', 'salesforce',
];

const SESSION_APPS: { slug: string; name: string }[] = [
  { slug: 'slack', name: 'Slack' },
  { slug: 'gmail', name: 'Gmail' },
  { slug: 'linear', name: 'Linear' },
];

const TRIGGER_FEED: { app: string; event: string; age: string }[] = [
  { app: 'gmail', event: 'message.new', age: '2s' },
  { app: 'stripe', event: 'charge.succeeded', age: '8s' },
  { app: 'linear', event: 'issue.opened', age: '14s' },
];

const WORKBENCH_CODE = `const result = await composio.workbench.run(\`
  const issues = await tools.LINEAR_LIST_ISSUES();
  const summary = await ai.summarize(issues);
  await tools.SLACK_POST({ channel, text: summary });
\`);`;

/**
 * Welcome-page capability grid. Compact card style with proper borders,
 * subtle shadow on hover, and a tight single-row visual at the bottom
 * of each card so the section reads as four discrete cards rather than
 * a flat block.
 */
export function HomeFeatures() {
  return (
    <section className="not-prose mb-14">
      <SectionHeading
        eyebrow="What you get"
        title="Everything you need to ship production agents."
      />
      <div className="grid grid-cols-1 gap-5 sm:auto-rows-fr sm:grid-cols-2">
        <FeatureCard
          title="Tools that resolve by intent."
          description="Smart tool search over 1000+ apps — surfaced just-in-time, with the right scope."
          href="/docs/tools-and-toolkits"
          visual={<ToolkitsVisual />}
        />
        <FeatureCard
          title="Auth and context, per end-user."
          description="OAuth, API keys, and tokens scoped to each user — refreshed automatically."
          href="/docs/authentication"
          visual={<SessionsVisual />}
        />
        <FeatureCard
          title="Listen to anything, anywhere."
          description="Subscribe to events from any toolkit and route them straight to your agent."
          href="/docs/triggers"
          visual={<TriggersVisual />}
        />
        <FeatureCard
          title="Run arbitrary code, safely."
          description="A workbench pre-wired with your user's connected accounts and 1000+ tools."
          href="/docs/workbench"
          visual={<WorkbenchVisual />}
        />
      </div>
    </section>
  );
}

function FeatureCard({
  title,
  description,
  href,
  visual,
}: {
  title: string;
  description: string;
  href: string;
  visual: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col justify-between gap-4 overflow-hidden border border-fd-border bg-fd-card p-5 no-underline shadow-[0_1px_0_rgba(15,15,15,0.04)] transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-px hover:border-fd-foreground/15 hover:shadow-[0_10px_24px_-12px_rgba(15,15,15,0.18)]"
    >
      <ArrowUpRight
        aria-hidden="true"
        className="absolute right-4 top-4 size-3.5 text-fd-foreground/45 transition-transform group-hover:-translate-y-px group-hover:translate-x-px"
      />

      <div className="flex flex-col gap-1 pr-5">
        <h3 className="text-[18px] font-medium leading-snug tracking-[-0.01em] text-fd-foreground">
          {title}
        </h3>
        <p className="text-[13px] leading-[1.5] text-fd-foreground/65">
          {description}
        </p>
      </div>

      <div className="mt-1">{visual}</div>
    </Link>
  );
}

function ToolkitsVisual() {
  // 8×2 grid: 15 recognizable toolkit logos + a brand-tinted "+1K" cell
  // in the last slot. Smaller square tiles than before so the grid stays
  // in the same vertical footprint while showing roughly 1.7× more logos.
  return (
    <div className="grid grid-cols-8 gap-px overflow-hidden rounded-sm border border-fd-border bg-fd-border">
      {TOOLKIT_LOGOS.map((slug) => (
        <div
          key={slug}
          className="flex aspect-square items-center justify-center bg-fd-background"
        >
          <img
            alt=""
            aria-hidden="true"
            className="size-4 object-contain"
            draggable={false}
            src={`${LOGO_CDN}/${slug}`}
          />
        </div>
      ))}
      <div className="flex aspect-square items-center justify-center bg-[var(--composio-brand)]/10 font-mono text-[10px] font-medium tracking-[-0.01em] text-[var(--composio-brand)]">
        +1K
      </div>
    </div>
  );
}

function SessionsVisual() {
  return (
    <div className="overflow-hidden rounded-sm border border-fd-border bg-fd-background font-mono text-[11px]">
      <div className="flex items-center justify-between border-b border-fd-border px-2.5 py-1 text-fd-foreground/45">
        <span className="uppercase tracking-[0.04em]">user_id</span>
        <span className="text-fd-foreground/75">usr_9x2kLm7</span>
      </div>
      <ul className="flex flex-col">
        {SESSION_APPS.map((app, i) => (
          <li
            key={app.slug}
            className={
              'flex items-center justify-between px-2.5 py-1.5' +
              (i < SESSION_APPS.length - 1
                ? ' border-b border-fd-border'
                : '')
            }
          >
            <span className="inline-flex items-center gap-2 text-fd-foreground/75">
              <img
                alt=""
                aria-hidden="true"
                className="size-3.5 object-contain"
                draggable={false}
                src={`${LOGO_CDN}/${app.slug}`}
              />
              {app.name}
            </span>
            <span className="inline-flex items-center gap-1 text-[var(--composio-brand)]">
              <Check aria-hidden="true" className="size-3" />
              <span className="uppercase tracking-[0.04em]">connected</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TriggersVisual() {
  return (
    <div className="overflow-hidden rounded-sm border border-fd-border bg-fd-background font-mono text-[11px]">
      <div className="flex items-center justify-between border-b border-fd-border px-2.5 py-1 text-fd-foreground/45">
        <span className="inline-flex items-center gap-1.5">
          <span className="relative inline-flex">
            <span className="size-1.5 rounded-full bg-[var(--composio-brand)]" />
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--composio-brand)] opacity-60" />
          </span>
          <span className="uppercase tracking-[0.04em]">live</span>
        </span>
        <span className="uppercase tracking-[0.04em]">trigger feed</span>
      </div>
      <ul className="flex flex-col">
        {TRIGGER_FEED.map((row, i) => (
          <li
            key={`${row.app}-${row.event}`}
            className={
              'flex items-center gap-2 px-2.5 py-1.5 text-fd-foreground/75' +
              (i < TRIGGER_FEED.length - 1
                ? ' border-b border-fd-border'
                : '')
            }
          >
            <img
              alt=""
              aria-hidden="true"
              className="size-3.5 object-contain"
              draggable={false}
              src={`${LOGO_CDN}/${row.app}`}
            />
            <span className="truncate">
              <span className="text-fd-foreground/45">{row.app}.</span>
              <span>{row.event}</span>
            </span>
            <span className="ml-auto shrink-0 text-fd-foreground/35">
              {row.age}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WorkbenchVisual() {
  // Mirrors the active workbench tile in the hero animation: outer
  // composio_workbench panel with python 3.11 status, then an active
  // instance card with CPU lights, task label, brand-blue "DONE" badge,
  // and a fade-masked code preview.
  return (
    <div className="overflow-hidden rounded-sm border border-fd-border bg-fd-card font-mono">
      <div className="flex items-center justify-between border-b border-fd-border px-2.5 py-1 text-[10px]">
        <span className="uppercase tracking-[0.04em] text-fd-foreground/40">
          composio_workbench
        </span>
        <span className="inline-flex items-center gap-1 text-fd-foreground/40">
          <span className="relative inline-flex">
            <span className="size-1.5 rounded-full bg-[var(--composio-brand)]" />
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--composio-brand)] opacity-60" />
          </span>
          python 3.11
        </span>
      </div>
      <div className="bg-fd-muted">
        <div className="flex items-center justify-between gap-2 border-b border-fd-border px-2.5 py-1">
          <div className="flex min-w-0 items-center gap-2">
            <StaticCpuLights />
            <span className="truncate text-[9px] uppercase tracking-wider text-fd-foreground/50">
              Run summarization
            </span>
          </div>
          <span className="shrink-0 text-[9px] uppercase tracking-wider text-[var(--composio-brand)]">
            done
          </span>
        </div>
        <div
          className="relative overflow-hidden px-2.5 py-1.5"
          style={{
            maskImage:
              'linear-gradient(to bottom, black 0%, black 70%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, black 0%, black 70%, transparent 100%)',
          }}
        >
          <pre className="overflow-hidden text-[10px] leading-[1.6] text-fd-foreground/70">
            {WORKBENCH_CODE}
          </pre>
        </div>
      </div>
    </div>
  );
}

function StaticCpuLights() {
  // 4×2 grid of brand-blue cells; each cell runs the `hero-cpu-pulse`
  // keyframe with a staggered delay so they ripple out of phase, mimicking
  // the noise-driven CpuLights in the demo zone — but cheap CSS-only.
  const cells = Array.from({ length: 8 });
  return (
    <div
      className="grid shrink-0 gap-[1px]"
      style={{
        gridTemplateColumns: 'repeat(4, 4px)',
        gridTemplateRows: 'repeat(2, 4px)',
      }}
    >
      {cells.map((_, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        // Diagonal-ish stagger so cells light up in a wave.
        const delay = (col * 120 + row * 60) % 720;
        return (
          <span
            key={i}
            className="bg-[var(--composio-brand)]"
            style={{
              animation: `hero-cpu-pulse 1.4s ease-in-out ${delay}ms infinite`,
            }}
          />
        );
      })}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="mb-5 flex flex-col gap-1.5">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-fd-foreground/55">
        {eyebrow}
      </span>
      <h2 className="text-xl font-medium leading-[1.15] tracking-[-0.01em] text-fd-foreground sm:text-2xl">
        {title}
      </h2>
    </div>
  );
}
