import Link from 'next/link';
import {
  ArrowUpRight,
  BookOpenText,
  Boxes,
  History,
  Blocks,
  Wrench,
  LifeBuoy,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { SectionHeading } from './home-features';

const RESOURCES = [
  {
    icon: <BookOpenText aria-hidden="true" className="size-4" />,
    title: 'Quickstart',
    description: 'A working agent in five steps.',
    href: '/docs/quickstart',
  },
  {
    icon: <Boxes aria-hidden="true" className="size-4" />,
    title: 'API Reference',
    description: 'Every endpoint, with cURL.',
    href: '/reference',
  },
  {
    icon: <Wrench aria-hidden="true" className="size-4" />,
    title: 'Cookbooks',
    description: 'End-to-end recipes for real agents.',
    href: '/cookbooks',
  },
  {
    icon: <History aria-hidden="true" className="size-4" />,
    title: 'Changelog',
    description: 'What shipped this week.',
    href: '/docs/changelog',
  },
  {
    icon: <Blocks aria-hidden="true" className="size-4" />,
    title: 'Toolkits',
    description: 'Browse the 1000+ apps your agent can act on.',
    href: '/toolkits',
  },
  {
    icon: <LifeBuoy aria-hidden="true" className="size-4" />,
    title: 'Troubleshooting',
    description: 'Common errors and how to fix them.',
    href: '/docs/troubleshooting',
  },
];

/**
 * Welcome-page resources row — secondary destinations the reader is
 * likely to need next. Pattern lifted from the OpenAI Platform "Help
 * center / Developer forum / Cookbook / Status" footer row.
 */
export function HomeResources() {
  return (
    <section className="not-prose mb-12">
      <SectionHeading eyebrow="Keep exploring" title="Reach for the rest." />
      <div className="grid grid-cols-1 gap-px border border-fd-border bg-fd-border sm:grid-cols-2 lg:grid-cols-3">
        {RESOURCES.map((resource) => (
          <ResourceCard key={resource.title} {...resource} />
        ))}
      </div>
    </section>
  );
}

function ResourceCard({
  icon,
  title,
  description,
  href,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-1.5 bg-fd-background p-5 no-underline transition-colors hover:bg-fd-accent/40"
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-fd-foreground/80">
          {icon}
          <span className="text-[15px] font-medium tracking-[-0.005em] text-fd-foreground">
            {title}
          </span>
        </span>
        <ArrowUpRight
          aria-hidden="true"
          className="size-3.5 text-fd-foreground/50 transition-transform group-hover:-translate-y-px group-hover:translate-x-px"
        />
      </div>
      <p className="text-[13px] leading-[1.55] text-fd-foreground/65">
        {description}
      </p>
    </Link>
  );
}
