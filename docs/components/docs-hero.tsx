import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

/**
 * Welcome-page hero — Composio brand language synced with composio.dev.
 * Right-side art is Malay's shader fallback from the landing site
 * (~/composio/landing/public/images/shader-fallback.jpg).
 */
export function DocsHero() {
  return (
    <div className="not-prose relative mb-12 grid grid-cols-1 items-center gap-10 border-b border-fd-border pb-12 sm:pb-16 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
      <div className="flex flex-col gap-6">
        <h1 className="text-4xl font-medium leading-[0.95] tracking-[-0.02em] text-fd-foreground md:text-5xl lg:text-[64px]">
          Composio
          <br />
          Documentation
        </h1>
        <p className="max-w-[540px] text-base leading-[1.5] text-fd-muted-foreground md:text-lg">
          Composio powers 1000+ toolkits, tool search, context management,
          authentication, and a sandboxed workbench to help you build AI agents
          that turn intent into action.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/docs/quickstart"
            className="group inline-flex items-center gap-1.5 bg-[var(--composio-brand)] px-4 py-2.5 font-mono text-sm uppercase tracking-[-0.28px] text-white transition-colors hover:bg-[#0006a8]"
          >
            Get Started
            <ArrowUpRight aria-hidden="true" className="size-4 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
          </Link>
          <Link
            href="https://dashboard.composio.dev/~/project/playground"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1.5 border border-fd-border bg-transparent px-4 py-2.5 font-mono text-sm uppercase tracking-[-0.28px] text-fd-foreground transition-colors hover:border-fd-foreground"
          >
            Playground
            <ArrowUpRight aria-hidden="true" className="size-4 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
          </Link>
        </div>
      </div>
      <div className="relative hidden aspect-[5/4] w-full max-w-[460px] justify-self-end overflow-hidden border border-fd-border lg:block">
        <Image
          src="/images/hero/shader.jpg"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 460px, 100vw"
          className="object-cover"
        />
      </div>
    </div>
  );
}
