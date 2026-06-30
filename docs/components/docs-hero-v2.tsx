import Link from 'next/link';
import { Play, Code2, Blocks } from 'lucide-react';
import { DocsHeroV2Chat } from './docs-hero-v2-chat';

const CHIPS = [
  { label: 'Quickstart', href: '/docs/quickstart', icon: Play },
  { label: 'API reference', href: '/reference', icon: Code2 },
  { label: 'Toolkits', href: '/toolkits', icon: Blocks },
];

/**
 * Welcome-page hero — v2.
 *
 * Two-column layout: copy + entry points on the left, mock chat / agent
 * loop on the right. Left column mirrors the dev-platform pattern
 * popularized by Claude / OpenAI docs: small eyebrow, large headline,
 * sub paragraph, search input, then a row of quick-link chips.
 */
export function DocsHeroV2() {
  return (
    <section className="relative grid grid-cols-1 items-start gap-8 py-4 md:py-6 lg:h-[500px] lg:grid-cols-2 lg:gap-12">
      {/* Left — copy + entry points */}
      <div className="flex flex-col gap-5">
        <h1 className="text-3xl font-medium leading-[1.05] tracking-[-0.025em] text-fd-foreground md:text-4xl lg:text-[40px]">
          Start building with Composio.
        </h1>

        <p className="max-w-[480px] text-[15px] leading-[1.55] text-fd-foreground/70 md:text-base">
          Give your AI agent 1000+ pre-authenticated toolkits, per-user
          sessions, triggers, and a workbench.
        </p>

        {/* Quick-link chips — single column */}
        <div className="flex max-w-[360px] flex-col gap-2">
          {CHIPS.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              className="flex items-center gap-2.5 rounded-md border border-fd-border bg-fd-card px-4 py-3 text-[15px] text-fd-foreground no-underline transition-colors hover:border-fd-foreground/15 hover:bg-fd-accent/40"
              href={href}
            >
              <Icon
                aria-hidden="true"
                className="size-4 text-[var(--composio-brand)]"
              />
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Right — mock chat with floating "active tool" card.
          Hidden below lg: the layered animation is fiddly on small
          screens and the left column carries the welcome on its own. */}
      <div className="relative hidden lg:block lg:h-full">
        <DocsHeroV2Chat />
      </div>
    </section>
  );
}
