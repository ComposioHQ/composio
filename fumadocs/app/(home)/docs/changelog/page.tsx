import { changelogEntries, formatDate, dateToChangelogUrl } from '@/lib/source';
import { getMDXComponents } from '@/mdx-components';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page';
import { CopyLink } from '@/components/copy-link';

const mdxComponents = getMDXComponents();

export default function ChangelogPage() {
  const entries = [...changelogEntries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <DocsPage toc={[]} footer={{ enabled: false }}>
      <DocsTitle>Changelog</DocsTitle>
      <DocsDescription>Latest updates and announcements</DocsDescription>
      <DocsBody>
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-0 top-2 bottom-0 w-px bg-border hidden md:block md:left-[7.5rem]" />

          <div className="space-y-12">
            {entries.map((entry) => {
              const Content = entry.body;

              return (
                <article key={`${entry.date}-${entry.title}`} className="relative">
                  {/* Date column */}
                  <div className="mb-3 md:absolute md:left-0 md:w-28 md:text-right md:pr-6">
                    <CopyLink
                      href={dateToChangelogUrl(entry.date)}
                      className="text-sm font-medium text-orange-500 hover:text-orange-600 transition-colors"
                    >
                      {formatDate(entry.date)}
                    </CopyLink>
                  </div>

                  {/* Timeline dot */}
                  <div className="hidden md:block absolute left-[7.5rem] top-1.5 -translate-x-1/2">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary ring-4 ring-background" />
                  </div>

                  {/* Content */}
                  <div className="md:pl-36">
                    <h2 className="text-2xl font-semibold mb-4">{entry.title}</h2>
                    <div className="prose prose-neutral dark:prose-invert max-w-none">
                      <Content components={mdxComponents} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </DocsBody>
    </DocsPage>
  );
}
