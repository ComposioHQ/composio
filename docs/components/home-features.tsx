import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { AuthDiagram } from './home-auth-diagram';
import { MOCK_FADE_STYLE } from './home-shared';

const LOGO_CDN = 'https://logos.composio.dev/api';
// 10-col × 3-row grid: 29 recognizable toolkit logos plus a brand-tinted
// "+1K" cell in the final slot, ordered as a rough mixed rhythm of comms,
// project management, storage/design, and marketing/sales so no single
// category clusters visually.
const TOOLKIT_LOGOS = [
  'gmail', 'slack', 'discord', 'zoom', 'notion',
  'linear', 'jira', 'asana', 'trello', 'clickup',
  'github', 'gitlab', 'figma', 'canva', 'googledrive',
  'dropbox', 'airtable', 'confluence', 'salesforce', 'hubspot',
  'stripe', 'shopify', 'zendesk', 'sendgrid', 'mailchimp',
  'calendly', 'youtube', 'twitter', 'linkedin',
];

const TRIGGER_FEED: { app: string; event: string }[] = [
  { app: 'gmail', event: 'message.new' },
  { app: 'stripe', event: 'charge.succeeded' },
  { app: 'linear', event: 'issue.opened' },
];

// The sandbox is a persistent *Python* environment the agent drives through
// the COMPOSIO_REMOTE_WORKBENCH meta tool, with `run_composio_tool` /
// `invoke_llm` pre-initialized — see content/docs/sandbox/remote.mdx, which is
// where this card links. Keep the mock on that real surface so a reader who
// copies it lands on something that exists.
const SANDBOX_CODE = `issues, err = run_composio_tool("LINEAR_LIST_ISSUES", {})
summary = invoke_llm(f"Summarize: {issues}")
run_composio_tool("SLACK_SEND_MESSAGE", {"text": summary})`;

export function HomeFeatures() {
  return (
    <section className="not-prose mb-20">
      <SectionHeading title="Everything you need to ship production agents." />
      <div className="grid grid-cols-1 gap-6 sm:auto-rows-fr sm:grid-cols-2">
        <FeatureCard
          title="Tools that resolve by intent."
          description="Smart tool search over 1000+ apps, surfaced just in time with the right scope."
          href="/docs/how-composio-works"
          visual={<ToolkitsVisual />}
        />
        <FeatureCard
          title="Auth and context, per end-user."
          description="OAuth, API keys, and tokens scoped to each user and refreshed automatically."
          href="/docs/authentication"
          visual={<AuthDiagram />}
        />
        <FeatureCard
          title="Listen to anything, anywhere."
          description="Subscribe to events from any toolkit and route them straight to your agent."
          href="/docs/triggers"
          visual={<TriggersVisual />}
        />
        <FeatureCard
          title="Run arbitrary code, safely."
          description="A sandbox pre-wired with your user's connected accounts and 1000+ tools."
          href="/docs/sandbox"
          visual={<SandboxVisual />}
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
      className="group relative flex flex-col overflow-hidden border border-fd-border bg-fd-card p-5 no-underline shadow-[0_1px_0_rgba(15,15,15,0.04)] transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-px hover:border-fd-foreground/15 hover:shadow-[0_10px_24px_-12px_rgba(15,15,15,0.18)] sm:p-6"
    >
      <ArrowUpRight
        aria-hidden="true"
        className="absolute right-4 top-4 size-3.5 text-fd-foreground/45 transition-transform group-hover:-translate-y-px group-hover:translate-x-px sm:right-5 sm:top-5"
      />
      <div className="flex flex-col gap-1.5 pr-6">
        <h3 className="text-balance text-[18px] font-medium leading-snug tracking-[-0.01em] text-fd-foreground">
          {title}
        </h3>
        <p className="max-w-[42ch] text-pretty text-[14px] leading-[1.55] text-fd-foreground/70">
          {description}
        </p>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none mt-6 h-40 select-none"
        style={MOCK_FADE_STYLE}
      >
        {visual}
      </div>
    </Link>
  );
}

function ToolkitsVisual() {
  // 10×3 tile grid stretched to fill the visual pane. Tiles paint their own
  // bg-fd-card so they read as elevated on the recessed pane; the container's
  // bg-fd-border bleeds through the 1px gaps to draw hairlines between them.
  return (
    <div className="grid h-full w-full grid-cols-10 grid-rows-3 gap-px overflow-hidden rounded-[8px] border border-fd-border bg-fd-border">
      {TOOLKIT_LOGOS.map((slug) => (
        <div
          key={slug}
          className="flex items-center justify-center bg-fd-card"
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
      <div className="flex items-center justify-center bg-[var(--composio-brand)]/10 font-mono text-[11px] font-medium tracking-[-0.01em] text-[var(--composio-brand)]">
        +1K
      </div>
    </div>
  );
}

function TriggersVisual() {
  return (
    <ul className="flex h-full w-full flex-col overflow-hidden rounded-[8px] border border-fd-border bg-fd-card font-mono text-[11.5px]">
      {TRIGGER_FEED.map((row, i) => (
        <li
          key={`${row.app}-${row.event}`}
          className={
            'flex flex-1 items-center gap-3 px-4' +
            (i < TRIGGER_FEED.length - 1 ? ' border-b border-fd-border' : '')
          }
        >
          <img
            alt=""
            aria-hidden="true"
            className="size-4 object-contain"
            draggable={false}
            src={`${LOGO_CDN}/${row.app}`}
          />
          <span className="truncate">
            <span className="text-fd-foreground/45">{row.app}.</span>
            <span className="text-fd-foreground/80">{row.event}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function SandboxVisual() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[8px] border border-fd-border bg-fd-card">
      <div className="flex shrink-0 items-center gap-2 border-b border-fd-border px-3.5 py-2">
        <span className="size-1.5 rounded-full bg-fd-foreground/25" />
        <span className="font-mono text-[10.5px] tracking-[0.02em] text-fd-foreground/50">
          sandbox.py
        </span>
      </div>
      <pre className="flex-1 overflow-hidden bg-fd-muted/30 px-3.5 py-2.5 font-mono text-[10.5px] leading-[1.7] text-fd-foreground/70">
        {SANDBOX_CODE}
      </pre>
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  id,
  title,
}: {
  eyebrow?: string;
  id?: string;
  title: string;
}) {
  return (
    <div className="mb-5 flex flex-col gap-1.5">
      {eyebrow && (
        <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-fd-foreground/55">
          {eyebrow}
        </span>
      )}
      <h2
        className="text-balance text-xl font-medium leading-[1.15] tracking-[-0.01em] text-fd-foreground sm:text-2xl"
        id={id}
      >
        {title}
      </h2>
    </div>
  );
}
