import { changelogEntries, formatDate, getOgImageUrl } from '@/lib/source';
import type { Metadata } from 'next';

const description = 'Latest updates and announcements for Composio';

export const metadata: Metadata = {
  title: 'Changelog | Composio',
  description,
  alternates: { canonical: '/reference/changelog' },
  openGraph: {
    title: 'Changelog | Composio',
    description,
    images: [getOgImageUrl('reference', ['changelog'], 'Changelog', description)],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Changelog | Composio',
    description,
    images: [getOgImageUrl('reference', ['changelog'], 'Changelog', description)],
  },
};
import { getMDXComponents } from '@/mdx-components';
import {
  DocsBody,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page';
import { CopyLink } from '@/components/copy-link';
import { PageActions } from '@/components/page-actions';
import { EditOnGitHub } from '@/components/edit-on-github';

const mdxComponents = getMDXComponents();

function dateToChangelogAnchor(date: string) {
  return `#${date}`;
}

export default function ChangelogPage() {
  const entries = [...changelogEntries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const entriesByDate = new Map<string, typeof entries>();
  for (const entry of entries) {
    const group = entriesByDate.get(entry.date) ?? [];
    group.push(entry);
    entriesByDate.set(entry.date, group);
  }
  const groupedEntries = [...entriesByDate.entries()];
  const toc = [
    { title: 'Changelog', url: '#changelog', depth: 2 },
    { title: 'Latest', url: '#latest', depth: 3 },
    ...groupedEntries.slice(0, 20).map(([date]) => ({
      title: formatDate(date),
      url: dateToChangelogAnchor(date),
      depth: 3,
    })),
  ];

  return (
    <DocsPage toc={toc} footer={{ enabled: false }}>
      <DocsTitle id="changelog">Changelog</DocsTitle>
      <PageActions path="/reference/changelog" />
      <DocsBody>
        <p className="text-fd-muted-foreground">
          Latest updates and announcements for Composio.
        </p>
        <h2 id="latest">Latest</h2>
        <div className="relative">
          <div className="absolute left-0 top-2 bottom-0 w-px bg-border hidden md:block md:left-[7.5rem]" />

          <div className="space-y-12">
            {groupedEntries.map(([date, dateEntries]) => (
              <article key={date} className="relative">
                <div className="mb-3 md:absolute md:left-0 md:w-28 md:text-right md:pr-6">
                  <h3 id={date} className="m-0 scroll-mt-24 text-sm font-medium">
                    <CopyLink
                      href={dateToChangelogAnchor(date)}
                      className="text-blue-500 hover:text-blue-600 transition-colors"
                    >
                      {formatDate(date)}
                    </CopyLink>
                  </h3>
                </div>

                <div className="hidden md:block absolute left-[7.5rem] top-1.5 -translate-x-1/2">
                  <div className="w-2.5 h-2.5 rounded-full bg-primary ring-4 ring-background" />
                </div>

                <div className="space-y-10 md:pl-36">
                  {dateEntries.map((entry) => {
                    const Content = entry.body;

                    return (
                      <section key={`${entry.date}-${entry.title}`}>
                        <h2 className="text-2xl font-semibold mb-4">{entry.title}</h2>
                        <div className="prose prose-neutral dark:prose-invert max-w-none">
                          <Content components={mdxComponents} />
                        </div>
                      </section>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </div>
        <EditOnGitHub path="docs/app/(home)/reference/(v31)/changelog/page.tsx" />
      </DocsBody>
    </DocsPage>
  );
}
