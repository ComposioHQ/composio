'use client';

import {
  useState,
  useCallback,
  createContext,
  useContext,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

const FilterContext = createContext('');

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function Glossary({ children }: { children: ReactNode }) {
  const [filter, setFilter] = useState('');

  return (
    <FilterContext.Provider value={filter.toLowerCase()}>
      <div className="not-prose">
        <div className="hidden sm:grid grid-cols-[minmax(180px,1fr)_2fr] gap-4 border-b border-fd-border pb-3 mb-0">
          <div className="text-xs font-semibold text-fd-muted-foreground tracking-wider uppercase">
            Glossary Term
          </div>
          <div className="text-xs font-semibold text-fd-muted-foreground tracking-wider uppercase">
            Definition
          </div>
        </div>
        <div className="border-b border-fd-border py-3">
          <div className="relative max-w-sm">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fd-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Filter..."
              aria-label="Filter glossary terms"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-fd-border rounded-md bg-fd-background text-fd-foreground placeholder:text-fd-muted-foreground focus:outline-none focus:ring-2 focus:ring-fd-ring"
            />
          </div>
        </div>
        {children}
      </div>
    </FilterContext.Provider>
  );
}

export function GlossaryTerm({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  const filter = useContext(FilterContext);
  const [definitionText, setDefinitionText] = useState('');
  const id = slugify(name);

  const definitionRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      setDefinitionText(node.textContent?.toLowerCase() || '');
    }
  }, []);

  const matches =
    !filter ||
    name.toLowerCase().includes(filter) ||
    definitionText.includes(filter);

  if (!matches) return null;

  return (
    <div
      id={id}
      data-glossary-term={name}
      className={cn(
        'border-b border-fd-border py-4 scroll-mt-20',
        'grid grid-cols-1 sm:grid-cols-[minmax(180px,1fr)_2fr] gap-1 sm:gap-4',
      )}
    >
      <div className="font-medium text-fd-foreground text-sm">
        {name}
      </div>
      <div
        ref={definitionRef}
        className="text-sm text-fd-muted-foreground leading-relaxed [&_a]:text-fd-primary [&_a]:underline [&_code]:text-xs [&_code]:bg-fd-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded"
      >
        {children}
      </div>
    </div>
  );
}
