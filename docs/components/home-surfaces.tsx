import Link from 'next/link';
import { ArrowUp, ArrowUpRight, Mic, Plus } from 'lucide-react';
import type { ComponentType } from 'react';
import { HOME_INTENTS, homeIntentAnchor, type HomeIntent } from '@/lib/home-navigation';
import { MOCK_FADE_STYLE } from './home-shared';

/**
 * Each product is described by the same mock the dashboard onboarding
 * path step uses for it (composio_dashboard `path-step.tsx`): For You is
 * an agent chat composer next to the clients it plugs into, Platform is
 * the SDK in a code window — rebuilt here on docs theme tokens so they
 * hold up in both color schemes.
 */
const INTENT_VISUALS: Record<HomeIntent['id'], ComponentType> = {
  build: PlatformVisual,
  use: ForYouVisual,
};

export function HomeSurfaces() {
  return (
    <section className="not-prose mb-20" id="two-ways-to-start">
      <div className="flex flex-col gap-8">
        {HOME_INTENTS.map(intent => (
          <IntentCard key={intent.id} intent={intent} />
        ))}
      </div>
    </section>
  );
}

function IntentCard({ intent }: { intent: HomeIntent }) {
  const Visual = INTENT_VISUALS[intent.id];

  return (
    <article className="grid overflow-hidden border border-fd-border bg-fd-card shadow-[0_1px_0_rgba(15,15,15,0.04)] md:grid-cols-[minmax(0,1fr)_calc(50%-0.75rem)]">
      <div className="relative overflow-hidden border-b border-fd-border bg-fd-background p-5 pb-40 sm:p-6 sm:pb-44 md:min-h-72 md:border-b-0 md:border-r md:pb-6">
        <div className="relative z-[1] flex flex-col gap-2.5">
          <h3
            className="flex items-center gap-2"
            id={homeIntentAnchor(intent.product)}
          >
            <img
              alt="Composio"
              className="h-[22px] w-auto dark:hidden"
              src="/Composio Logo.svg"
            />
            <img
              alt="Composio"
              className="hidden h-[22px] w-auto dark:block"
              src="/Composio Logo Dark.svg"
            />
            <ProductBadge product={intent.product} />
          </h3>
          <p className="max-w-[42ch] text-pretty text-[14px] leading-[1.55] text-fd-foreground/70">
            {intent.description}
          </p>
        </div>
        <div aria-hidden="true" className="pointer-events-none select-none">
          <Visual />
        </div>
      </div>
      <ul className="flex flex-col divide-y divide-fd-border">
        {intent.links.map(link => (
          <li className="flex flex-1" key={link.href}>
            <Link
              className="group flex flex-1 items-center justify-between gap-4 px-4 py-5 no-underline transition-colors hover:bg-fd-accent/40 sm:px-5 sm:py-6"
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
                className="size-3.5 shrink-0 text-fd-foreground/50 transition-transform group-hover:-translate-y-px group-hover:translate-x-px"
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

/**
 * Port of the dashboard's `ComposioProductBadge` (composio_dashboard
 * `composio-product-badge.tsx`) so the docs fork and the dashboard product
 * switcher name the two products with the same mark.
 */
function ProductBadge({ product }: { product: HomeIntent['product'] }) {
  const isPlatform = product === 'Platform';

  return (
    <span
      className={
        'relative flex items-center rounded-[5px] px-[9px] py-[7px] font-mono text-[14px] font-semibold uppercase leading-none tracking-wide ' +
        (isPlatform
          ? 'product-badge-platform'
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
          'pointer-events-none absolute inset-0 rounded-[5px] ' +
          (isPlatform
            ? 'product-badge-platform-border'
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
      {product}
    </span>
  );
}

const FOR_YOU_CLIENT_LOGOS = [
  { src: '/images/clients/claude.svg', label: 'Claude' },
  { src: '/images/clients/codex.png', label: 'Codex' },
  { src: '/images/clients/cursor.svg', label: 'Cursor' },
  { src: '/images/clients/openclaw.svg', label: 'OpenClaw' },
];

function ForYouVisual() {
  return (
    <div className="absolute inset-x-5 -bottom-3 flex items-end gap-4 sm:inset-x-6">
      <div className="grid shrink-0 grid-cols-2 gap-2.5" style={MOCK_FADE_STYLE}>
        {FOR_YOU_CLIENT_LOGOS.map(logo => (
          <img
            alt=""
            className="size-8 object-contain"
            draggable={false}
            key={logo.label}
            src={logo.src}
          />
        ))}
      </div>
      <div
        className="min-w-0 flex-1 rounded-[18px] border border-fd-border bg-fd-card p-3"
        style={MOCK_FADE_STYLE}
      >
        <div className="text-[12px] text-fd-foreground/50">How can I help?</div>
        <div className="mt-4 flex items-center gap-2 text-fd-foreground/50">
          <Plus className="size-3.5 shrink-0" />
          <Mic className="ml-auto size-3.5 shrink-0" />
          <span className="flex size-6 shrink-0 items-center justify-center rounded-[8px] bg-[var(--composio-brand)] text-white">
            <ArrowUp className="size-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}

function PlatformVisual() {
  return (
    <div
      className="absolute inset-x-5 -bottom-3 rounded-[12px] border border-fd-border bg-fd-card p-3 font-mono text-[11.5px] leading-[1.75] text-fd-foreground/75 sm:inset-x-6"
      style={MOCK_FADE_STYLE}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-fd-foreground/15" />
        <span className="size-2 rounded-full bg-fd-foreground/15" />
        <span className="size-2 rounded-full bg-fd-foreground/15" />
      </div>
      <div className="truncate">
        <span className="text-[var(--composio-brand)]">import</span>
        {" { Composio } "}
        <span className="text-[var(--composio-brand)]">from</span>
        <span className="text-fd-foreground/55">{" '@composio/core'"}</span>
      </div>
      <div className="truncate">
        <span className="text-[var(--composio-brand)]">import</span>
        {" { OpenAIAgentsProvider } "}
        <span className="text-[var(--composio-brand)]">from</span>
        <span className="text-fd-foreground/55">
          {" '@composio/openai-agents'"}
        </span>
      </div>
      <div className="truncate">
        <span className="text-[var(--composio-brand)]">const</span>
        {' composio = '}
        <span className="text-[var(--composio-brand)]">new</span>
        {' Composio'}
        <span className="text-fd-foreground/45">
          ({'{ provider: '}
          <span className="text-[var(--composio-brand)]">new</span>
          {' OpenAIAgentsProvider() }'})
        </span>
      </div>
      <div className="truncate">
        <span className="text-[var(--composio-brand)]">const</span>
        {' session = '}
        <span className="text-[var(--composio-brand)]">await</span>
        {' composio.create'}
        <span className="text-fd-foreground/45">(userId)</span>
      </div>
      <div className="truncate">
        <span className="text-[var(--composio-brand)]">const</span>
        {' tools = '}
        <span className="text-[var(--composio-brand)]">await</span>
        {' session.tools'}
        <span className="text-fd-foreground/45">()</span>
      </div>
      <div className="truncate">
        <span className="text-[var(--composio-brand)]">const</span>
        {' agent = '}
        <span className="text-[var(--composio-brand)]">new</span>
        {' Agent'}
        <span className="text-fd-foreground/45">({'{ name, instructions, model, tools }'})</span>
      </div>
    </div>
  );
}
