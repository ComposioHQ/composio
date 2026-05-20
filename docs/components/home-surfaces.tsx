'use client';

import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowUpRight,
  Code2,
  Heart,
  Bot,
  Terminal,
  Copy,
  Check,
} from 'lucide-react';
import { useState, type ReactNode, type MouseEvent } from 'react';
import { SectionHeading } from './home-features';

// Some provider logos ship a dedicated `-dark` variant (white-on-dark
// or stroke-inverted). Use those in dark mode instead of inverting the
// light SVG via CSS — `dark:invert` mangles full-colour logos
// (Google's primary palette, LlamaIndex's gradient, CrewAI's brand).
const PROVIDERS: { name: string; logo: string; logoDark?: string }[] = [
  {
    name: 'Anthropic',
    logo: '/images/providers/anthropic-logo.svg',
    logoDark: '/images/providers/anthropic-logo-dark.svg',
  },
  {
    name: 'OpenAI',
    logo: '/images/providers/openai-logo.svg',
    logoDark: '/images/providers/openai-logo-dark.svg',
  },
  {
    name: 'Vercel AI',
    logo: '/images/providers/vercel-logo.svg',
    logoDark: '/images/providers/vercel-logo-dark.svg',
  },
  { name: 'Google', logo: '/images/providers/google-logo.svg' },
  {
    name: 'LangChain',
    logo: '/images/providers/langchain-logo.svg',
    logoDark: '/images/providers/langchain-logo-dark.svg',
  },
  { name: 'CrewAI', logo: '/images/providers/crewai-logo.svg' },
  { name: 'LlamaIndex', logo: '/images/providers/llamaIndex-logo.svg' },
  {
    name: 'Mastra',
    logo: '/images/providers/mastra-logo.svg',
    logoDark: '/images/providers/mastra-logo-dark.svg',
  },
];

const CLIENTS: { name: string; logo: string; h: number }[] = [
  { name: 'Claude', logo: '/images/clients/claude.svg', h: 20 },
  { name: 'Codex', logo: '/images/clients/codex.png', h: 20 },
  { name: 'Cursor', logo: '/images/clients/cursor.svg', h: 20 },
  { name: 'Windsurf', logo: '/images/clients/windsurf.svg', h: 20 },
  { name: 'OpenClaw', logo: '/images/clients/openclaw.svg', h: 20 },
];

/**
 * Welcome-page audience selector — surfaces the three ways into Composio.
 * "Build with the SDK" gets the full width of the top row and a strip of
 * provider logos showing which frameworks ship first-class support; the
 * two non-developer surfaces (For You + Agents) sit below in a 2-col
 * row.
 */
export function HomeSurfaces() {
  return (
    <section className="not-prose mb-14">
      <SectionHeading
        eyebrow="For everyone"
        title="Three ways to use Composio."
      />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {/* Full-width Developers card */}
        <SurfaceCard
          eyebrow="Developers"
          eyebrowIcon={<Code2 aria-hidden="true" className="size-4" />}
          title="Build with the SDK"
          description="You're here. TypeScript or Python, with first-class providers for the frameworks you already use."
          href="/docs/quickstart"
          external={false}
          spanFull
          extra={<ProviderStrip />}
        />
        {/* Bottom row: For You + Agents */}
        <SurfaceCard
          eyebrow="For You"
          eyebrowIcon={<Heart aria-hidden="true" className="size-4" />}
          title="Use Composio yourself"
          description="Plug 1000+ pre-authenticated apps into Claude Code, Cursor, or any MCP client. No build required — connect once and go."
          href="https://composio.dev/for-you"
          external
          extra={<ClientStrip />}
        />
        <SurfaceCard
          eyebrow="CLI"
          eyebrowIcon={<Terminal aria-hidden="true" className="size-4" />}
          title="Run Composio from your shell"
          description="Connect accounts, search tools, and execute them right from your terminal."
          href="/docs/cli"
          external={false}
          extra={<CliInstall />}
        />
        <SurfaceCard
          eyebrow="Agents"
          eyebrowIcon={<Bot aria-hidden="true" className="size-4" />}
          title="Sign up as an agent"
          description="Agents can create their own Composio identity at agents.composio.dev — no human in the loop — and start running tools in seconds."
          href="https://agents.composio.dev"
          external
        />
      </div>
    </section>
  );
}

function SurfaceCard({
  eyebrowIcon,
  eyebrow,
  title,
  description,
  href,
  external,
  spanFull,
  extra,
}: {
  eyebrowIcon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  external: boolean;
  spanFull?: boolean;
  extra?: ReactNode;
}) {
  const externalProps = external
    ? { target: '_blank' as const, rel: 'noopener noreferrer' }
    : {};
  return (
    <Link
      href={href}
      {...externalProps}
      className={
        'group relative flex flex-col gap-3 overflow-hidden border border-fd-border bg-fd-card p-6 no-underline shadow-[0_1px_0_rgba(15,15,15,0.04)] transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-px hover:border-fd-foreground/15 hover:shadow-[0_10px_24px_-12px_rgba(15,15,15,0.18)] sm:p-7' +
        (spanFull ? ' md:col-span-3' : '')
      }
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--composio-brand)]">
          {eyebrowIcon}
          {eyebrow}
        </span>
        <ArrowUpRight
          aria-hidden="true"
          className="size-3.5 text-fd-foreground/60 transition-transform group-hover:-translate-y-px group-hover:translate-x-px"
        />
      </div>
      <h3 className="text-[17px] font-medium leading-snug tracking-[-0.01em] text-fd-foreground sm:text-lg">
        {title}
      </h3>
      <p className="text-[14px] leading-[1.55] text-fd-foreground/70">
        {description}
      </p>
      {extra}
    </Link>
  );
}

const CLI_INSTALL_COMMAND = 'curl -fsSL https://composio.dev/install | bash';

function CliInstall() {
  const [copied, setCopied] = useState(false);

  function handleCopy(e: MouseEvent<HTMLButtonElement>) {
    // The whole card is wrapped in a <Link> — keep this click from
    // navigating to /docs/cli.
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(CLI_INSTALL_COMMAND).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="mt-2 flex items-center gap-2 border border-fd-border bg-fd-background px-3 py-2 font-mono text-[12px]">
      <span className="shrink-0 text-fd-foreground/40">$</span>
      <code className="flex-1 truncate text-fd-foreground/85">
        {CLI_INSTALL_COMMAND}
      </code>
      <button
        aria-label={copied ? 'Copied' : 'Copy install command'}
        className="-mr-1 inline-flex size-6 shrink-0 items-center justify-center text-fd-foreground/55 transition-colors hover:text-fd-foreground"
        onClick={handleCopy}
        type="button"
      >
        {copied ? (
          <Check
            aria-hidden="true"
            className="size-3.5 text-[var(--composio-brand)]"
          />
        ) : (
          <Copy aria-hidden="true" className="size-3.5" />
        )}
      </button>
    </div>
  );
}

function ClientStrip() {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-3">
      {CLIENTS.map((c) => (
        <Image
          key={c.name}
          alt={c.name}
          className="object-contain"
          height={c.h}
          src={c.logo}
          style={{ height: c.h, width: 'auto' }}
          width={Math.ceil(c.h * 3.5)}
        />
      ))}
    </div>
  );
}

function ProviderStrip() {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      {PROVIDERS.map((p) => (
        <div
          key={p.name}
          className="flex h-10 items-center justify-center gap-2 rounded-md border border-fd-border bg-fd-card px-3"
          title={p.name}
        >
          {p.logoDark ? (
            <>
              <Image
                alt={p.name}
                className="h-4 w-auto object-contain dark:hidden"
                height={16}
                src={p.logo}
                width={64}
              />
              <Image
                alt=""
                aria-hidden="true"
                className="hidden h-4 w-auto object-contain dark:block"
                height={16}
                src={p.logoDark}
                width={64}
              />
            </>
          ) : (
            <Image
              alt={p.name}
              className="h-4 w-auto object-contain"
              height={16}
              src={p.logo}
              width={64}
            />
          )}
          <span className="text-[12px] text-fd-foreground/75">{p.name}</span>
        </div>
      ))}
    </div>
  );
}
