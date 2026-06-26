'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';

/* ------------------------------------------------------------------ *
 * Items come from each example's frontmatter (read in the route from the
 * examples source). Title + description are the page's own; the `gallery`
 * block in frontmatter supplies the category lane, toolkit logos, and
 * featured flag. No per-example config lives in this component.
 * ------------------------------------------------------------------ */

type Category = 'General agents' | 'Background agents' | 'Coding agents';

/** A resolved example, ready to render. Built in the route from frontmatter. */
export interface GalleryItem {
  title: string;
  description: string;
  href: string;
  categories: Category[];
  logos: string[];
  featured?: boolean;
  order?: number;
}

/* ------------------------------------------------------------------ *
 * Category styling — flat editorial tags in the brand accent palette.
 * Full class strings are written out so Tailwind's JIT keeps them.
 * ------------------------------------------------------------------ */

interface CatStyle {
  tag: string; // mono pill on the card
  dot: string; // filter-pill dot
  bar: string; // top accent bar on hover
}

const CATEGORY_STYLES: Record<Category, CatStyle> = {
  'General agents': {
    tag: 'text-blue-500 border-blue-500/25 bg-blue-500/[0.06] dark:text-blue-400 dark:border-blue-400/25',
    dot: 'bg-blue-500 dark:bg-blue-400',
    bar: 'bg-blue-500 dark:bg-blue-400',
  },
  'Background agents': {
    tag: 'text-violet-500 border-violet-500/25 bg-violet-500/[0.06] dark:text-violet-400 dark:border-violet-400/25',
    dot: 'bg-violet-500 dark:bg-violet-400',
    bar: 'bg-violet-500 dark:bg-violet-400',
  },
  'Coding agents': {
    tag: 'text-emerald-600 border-emerald-500/25 bg-emerald-500/[0.06] dark:text-emerald-400 dark:border-emerald-400/25',
    dot: 'bg-emerald-600 dark:bg-emerald-400',
    bar: 'bg-emerald-600 dark:bg-emerald-400',
  },
};

const CATEGORIES: ('Featured' | Category)[] = [
  'Featured',
  'General agents',
  'Background agents',
  'Coding agents',
];

function logoUrl(name: string) {
  return `https://logos.composio.dev/api/${name}`;
}

/* ------------------------------------------------------------------ *
 * Card
 * ------------------------------------------------------------------ */

function ExampleCard({ ex, index }: { ex: GalleryItem; index: number }) {
  // The first category drives the hover accent bar.
  const primary = CATEGORY_STYLES[ex.categories[0] ?? 'General agents'];
  return (
    <Link
      href={ex.href}
      style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
      className="exg-card group relative flex flex-col border border-fd-border bg-fd-card [text-decoration:none] transition-[transform,box-shadow,background-color] duration-200 ease-out hover:-translate-x-[3px] hover:-translate-y-[3px] hover:bg-fd-card hover:shadow-[6px_6px_0_0_color-mix(in_srgb,var(--composio-brand)_24%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--composio-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-fd-background"
    >
      {/* top accent bar — grows in on hover */}
      <span
        className={`absolute left-0 top-0 h-[2px] w-0 transition-[width] duration-300 ease-out group-hover:w-full ${primary.bar}`}
      />

      <div className="flex items-start justify-between gap-4 p-5 pb-0">
        <div className="flex flex-wrap items-center gap-1.5">
          {ex.categories.map((cat) => (
            <span
              key={cat}
              className={`inline-flex items-center border px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-wide ${CATEGORY_STYLES[cat].tag}`}
            >
              {cat}
            </span>
          ))}
        </div>
        {ex.logos.length > 0 && (
          <div className="flex shrink-0 items-center -space-x-1.5">
            {ex.logos.map((logo) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={logo}
                alt={logo}
                src={logoUrl(logo)}
                // White tile in both themes (matches the brand's logo chips) so
                // monochrome marks like GitHub stay visible on dark cards.
                className="h-7 w-7 rounded-[5px] border border-black/10 bg-white object-contain p-1 ring-2 ring-fd-card"
                loading="lazy"
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-5 pt-4">
        <h3 className="font-sans text-lg font-medium leading-snug text-fd-foreground [text-wrap:balance]">
          {ex.title}
        </h3>
        <p className="line-clamp-3 text-sm leading-relaxed text-fd-muted-foreground">
          {ex.description}
        </p>
      </div>

      <div className="mt-auto flex items-center gap-1.5 border-t border-fd-border px-5 py-3 font-mono text-[11px] uppercase tracking-wide text-fd-muted-foreground transition-colors group-hover:text-[var(--composio-brand)]">
        Read guide
        <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ *
 * Gallery
 * ------------------------------------------------------------------ */

export function ExamplesGallery({ items }: { items: GalleryItem[] }) {
  const [active, setActive] = useState<'Featured' | Category>('Featured');

  const resolved = useMemo<GalleryItem[]>(
    () => [...items].sort((a, b) => (a.order ?? 99) - (b.order ?? 99)),
    [items],
  );

  const visible = useMemo(() => {
    if (active === 'Featured') return resolved.filter((e) => e.featured);
    return resolved.filter((e) => e.categories.includes(active));
  }, [active, resolved]);

  const countFor = (label: 'Featured' | Category) =>
    label === 'Featured'
      ? resolved.filter((e) => e.featured).length
      : resolved.filter((e) => e.categories.includes(label)).length;

  return (
    <div className="exg w-full px-5 py-12 sm:px-8 lg:px-12 lg:py-16">
      {/* Hero */}
      <header className="mb-10 max-w-3xl">
        <p className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-fd-muted-foreground">
          Examples
        </p>
        <h1 className="font-sans text-4xl font-normal leading-[1.05] tracking-tight text-fd-foreground sm:text-5xl lg:text-6xl">
          Featured examples
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-fd-muted-foreground sm:text-lg">
          End-to-end builds that wire Composio into working agents. Each one is a
          complete project you can read top to bottom and run.
        </p>
      </header>

      {/* Filter pills */}
      <div className="mb-9 flex flex-wrap gap-2 border-b border-fd-border pb-6">
        {CATEGORIES.map((label) => {
          const isActive = active === label;
          const count = countFor(label);
          const dot = label === 'Featured' ? undefined : CATEGORY_STYLES[label].dot;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setActive(label)}
              aria-pressed={isActive}
              className={`inline-flex items-center gap-2 border px-3.5 py-1.5 font-mono text-xs font-medium uppercase tracking-wide transition-colors duration-150 ${
                isActive
                  ? 'border-fd-foreground bg-fd-foreground text-fd-background'
                  : 'border-fd-border bg-fd-card text-fd-muted-foreground hover:border-fd-foreground/30 hover:text-fd-foreground'
              }`}
            >
              {label === 'Featured' ? (
                <span
                  className={`h-2 w-2 ${isActive ? 'bg-fd-background' : 'bg-[var(--composio-brand)]'}`}
                />
              ) : (
                <span className={`h-2 w-2 rounded-full ${dot}`} />
              )}
              {label}
              <span
                className={`tabular-nums ${isActive ? 'text-fd-background/55' : 'text-fd-muted-foreground/50'}`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {visible.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((ex, i) => (
            <ExampleCard key={ex.href} ex={ex} index={i} />
          ))}
        </div>
      ) : (
        <div className="border border-dashed border-fd-border px-6 py-16 text-center font-mono text-sm text-fd-muted-foreground">
          More examples in this category are on the way.
        </div>
      )}

      <style>{`
        .exg-card {
          opacity: 0;
          animation: exg-rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        @keyframes exg-rise {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .exg-card { animation: none; opacity: 1; }
          .exg-card * { transition: none !important; }
        }
      `}</style>
    </div>
  );
}
