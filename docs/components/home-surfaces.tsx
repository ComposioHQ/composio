import Link from 'next/link';
import { ArrowUpRight, Code2, Plug } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { HOME_INTENTS, homeIntentAnchor, type HomeIntent } from '@/lib/home-navigation';
import { SectionHeading } from './home-features';

const INTENT_ICONS: Record<HomeIntent['id'], LucideIcon> = {
  build: Code2,
  use: Plug,
};

export function HomeSurfaces() {
  return (
    <section className="not-prose mb-14">
      <SectionHeading
        eyebrow="Get started"
        id="two-ways-to-start"
        title="Two ways to start"
      />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {HOME_INTENTS.map(intent => (
          <IntentCard key={intent.id} intent={intent} />
        ))}
      </div>
    </section>
  );
}

function IntentCard({ intent }: { intent: HomeIntent }) {
  const Icon = INTENT_ICONS[intent.id];

  return (
    <article className="flex flex-col border border-fd-border bg-fd-card p-5 shadow-[0_1px_0_rgba(15,15,15,0.04)] sm:p-6">
      <AudienceBadge audience={intent.audience} />
      <div className="mb-4 flex items-center gap-2 text-[var(--composio-brand)]">
        <Icon aria-hidden="true" className="size-4" />
        <h3
          className="text-[18px] font-medium tracking-[-0.01em] text-fd-foreground"
          id={homeIntentAnchor(intent.title)}
        >
          {intent.title}
        </h3>
      </div>
      <p className="mb-5 text-[14px] leading-[1.55] text-fd-foreground/70">
        {intent.description}
      </p>
      <ul className="mt-auto flex flex-col gap-2">
        {intent.links.map(link => (
          <li key={link.href}>
            <Link
              className="group flex items-start justify-between gap-4 border border-fd-border bg-fd-background p-3.5 no-underline transition-[border-color,background-color] hover:border-fd-foreground/15 hover:bg-fd-accent/40"
              href={link.href}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[14px] font-medium text-fd-foreground">
                  {link.title}
                </span>
                <span className="text-[12.5px] leading-[1.45] text-fd-foreground/65">
                  {link.description}
                </span>
              </span>
              <ArrowUpRight
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0 text-fd-foreground/50 transition-transform group-hover:-translate-y-px group-hover:translate-x-px"
              />
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}

const PLATFORM_BADGE_GRADIENT =
  'linear-gradient(135deg, #00e68a, #00b4d8, #0077ff)';

function AudienceBadge({ audience }: { audience: HomeIntent['audience'] }) {
  const isPlatform = audience === 'Platform';

  return (
    <span
      className={
        'relative mb-4 flex w-fit items-center rounded-[4px] px-[calc(0.25em+2px)] py-[calc(0.167em+2px)] font-mono text-[0.667em] font-semibold uppercase leading-none tracking-wide ' +
        (isPlatform
          ? 'audience-badge-platform'
          : 'text-[#0007cd] dark:text-[#4d6fff]')
      }
      style={
        isPlatform
          ? {
              background: PLATFORM_BADGE_GRADIENT,
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }
          : undefined
      }
    >
      <span
        aria-hidden="true"
        className={
          'pointer-events-none absolute inset-0 rounded-[4px] ' +
          (isPlatform
            ? 'audience-badge-platform-border'
            : 'border border-[#0007cd] dark:border-[#4d6fff]')
        }
        style={
          isPlatform
            ? {
                padding: '1px',
                background: PLATFORM_BADGE_GRADIENT,
                WebkitMask:
                  'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                WebkitMaskComposite: 'xor',
                mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                maskComposite: 'exclude',
              }
            : undefined
        }
      />
      {audience}
    </span>
  );
}
