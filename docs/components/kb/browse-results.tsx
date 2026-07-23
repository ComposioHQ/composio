import { ArrowUpRight } from 'lucide-react';
import type { KnowledgeLink } from '@/lib/knowledge/catalog';
import type { KnowledgeSourceType } from '@/lib/knowledge/types';
import { SourceBadge } from './source-badge';

const GROUPS: Array<{ title: string; sourceTypes: KnowledgeSourceType[] }> = [
  { title: 'Docs', sourceTypes: ['docs'] },
  { title: 'Knowledge Base answers', sourceTypes: ['kb'] },
  { title: 'OAuth guides', sourceTypes: ['oauth-guide'] },
  { title: 'Toolkits', sourceTypes: ['toolkit'] },
  { title: 'Examples', sourceTypes: ['example'] },
  { title: 'Reference', sourceTypes: ['reference', 'legacy'] },
  { title: 'Changelog', sourceTypes: ['changelog'] },
];

export function BrowseResults({ links }: { links: KnowledgeLink[] }) {
  if (links.length === 0) {
    return (
      <div className="border border-fd-border p-6 text-sm text-fd-muted-foreground">
        No public pages are mapped here yet. Try the unified search or another product area.
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {GROUPS.map((group) => {
        const matches = links.filter((link) => group.sourceTypes.includes(link.sourceType));
        if (matches.length === 0) return null;

        return (
          <section key={group.title} aria-labelledby={`group-${group.title.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
            <div className="flex items-baseline justify-between gap-4 border-b border-fd-border pb-3">
              <h2 id={`group-${group.title.toLowerCase().replace(/[^a-z]+/g, '-')}`} className="text-xl font-semibold">
                {group.title}
              </h2>
              <span className="text-sm text-fd-muted-foreground">{matches.length}</span>
            </div>
            <ul className="divide-y divide-fd-border">
              {matches.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="group block py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fd-ring">
                    <div className="flex flex-wrap items-center gap-2">
                      <SourceBadge sourceType={link.sourceType} />
                      {link.lastVerifiedAt && (
                        <span className="text-xs text-fd-muted-foreground">Verified {link.lastVerifiedAt}</span>
                      )}
                    </div>
                    <div className="mt-2 flex items-start justify-between gap-4">
                      <h3 className="font-semibold group-hover:text-fd-primary">{link.title}</h3>
                      <ArrowUpRight className="mt-1 size-4 shrink-0 text-fd-muted-foreground" aria-hidden="true" />
                    </div>
                    <p className="mt-1.5 max-w-3xl text-sm leading-6 text-fd-muted-foreground">{link.description}</p>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
