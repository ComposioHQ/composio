import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

/**
 * Welcome-page hero — Composio brand language synced with composio.dev.
 * Full-bleed shader background (Malay's `shader-fallback.jpg` from the
 * landing site), centered content on top.
 */
export function DocsHero() {
  return (
    <div className="not-prose relative isolate mb-12 overflow-hidden border border-fd-border">
      <Image
        src="/images/hero/shader.jpg"
        alt=""
        fill
        priority
        sizes="(min-width: 1280px) 1024px, 100vw"
        className="-z-10 object-cover"
      />
      {/* readability scrim — soft white wash on light, soft black wash on dark */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-white/30 dark:bg-black/40"
      />

      <div className="relative flex flex-col items-center gap-6 px-6 py-20 text-center sm:py-24 lg:py-32">
        <h1 className="text-4xl font-medium leading-[0.95] tracking-[-0.02em] text-fd-foreground md:text-5xl lg:text-[64px]">
          Composio
          <br className="sm:hidden" />
          <span className="sm:ml-3">Documentation</span>
        </h1>
        <p className="max-w-[560px] text-base leading-[1.5] text-fd-foreground/80 md:text-lg">
          Composio powers 1000+ toolkits, tool search, context management,
          authentication, and a sandboxed workbench to help you build AI agents
          that turn intent into action.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/docs/quickstart"
            className="group inline-flex items-center gap-1.5 bg-[var(--composio-brand)] px-5 py-3 font-mono text-sm uppercase tracking-[-0.28px] no-underline transition-colors hover:bg-[#0006a8]"
            style={{ color: '#ffffff' }}
          >
            <span style={{ color: '#ffffff' }}>Get Started</span>
            <ArrowUpRight aria-hidden="true" className="size-4 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" style={{ color: '#ffffff' }} />
          </Link>
          <Link
            href="https://dashboard.composio.dev/~/project/playground"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1.5 border border-black/15 bg-white/70 px-5 py-3 font-mono text-sm uppercase tracking-[-0.28px] no-underline backdrop-blur-sm transition-colors hover:bg-white dark:border-white/20 dark:bg-black/40 dark:hover:bg-black/60"
            style={{ color: 'var(--color-fd-foreground)' }}
          >
            <span style={{ color: 'var(--color-fd-foreground)' }}>Playground</span>
            <ArrowUpRight aria-hidden="true" className="size-4 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
          </Link>
        </div>
      </div>
    </div>
  );
}
