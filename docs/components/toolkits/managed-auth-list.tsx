'use client';

import { useState, useMemo, useDeferredValue, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Search, Copy, Check } from 'lucide-react';

interface ManagedAuthToolkit {
  slug: string;
  name: string;
  logo: string | null;
  authSchemes: string[];
  composioManagedAuthSchemes?: string[];
  toolCount: number;
  triggerCount: number;
}

function CopyButton({ toolkits }: { toolkits: ManagedAuthToolkit[] }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = toolkits.map((t) => t.slug).join(', ');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-xs text-fd-muted-foreground transition-colors hover:text-fd-foreground"
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied!' : 'Copy slugs'}
    </button>
  );
}

function CopySlugButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    navigator.clipboard.writeText(slug.toUpperCase());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      aria-label={`Copy ${slug.toUpperCase()} to clipboard`}
      className="inline-flex items-center gap-1 rounded bg-fd-muted px-1.5 py-0.5 font-mono text-xs text-fd-muted-foreground transition-colors hover:text-fd-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
    >
      <span className="max-w-[120px] truncate sm:max-w-none">{slug.toUpperCase()}</span>
      {copied ? <Check className="h-3 w-3 text-green-500" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
    </button>
  );
}

function ToolkitIcon({ toolkit }: { toolkit: ManagedAuthToolkit }) {
  const [imgFailed, setImgFailed] = useState(false);
  const fallback = toolkit.name.trim().charAt(0).toUpperCase();

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-fd-border/50 bg-fd-background text-sm font-medium text-fd-muted-foreground sm:h-10 sm:w-10">
      {toolkit.logo && !imgFailed ? (
        <img
          src={toolkit.logo}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-[65%] w-[65%] object-contain"
          onError={() => setImgFailed(true)}
        />
      ) : (
        fallback
      )}
    </div>
  );
}

function ToolkitRow({ toolkit }: { toolkit: ManagedAuthToolkit }) {
  return (
    <Link
      href={`/toolkits/${toolkit.slug}`}
      className="group flex flex-col gap-2 px-2 py-3 transition-colors hover:bg-fd-accent/30 sm:flex-row sm:items-center sm:justify-between sm:px-0 sm:py-2.5"
    >
      <div className="flex items-center gap-3">
        <ToolkitIcon toolkit={toolkit} />
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <span className="truncate text-sm font-medium text-fd-foreground">{toolkit.name.trim()}</span>
          <CopySlugButton slug={toolkit.slug} />
        </div>
      </div>
    </Link>
  );
}

export function ManagedAuthList() {
  const [data, setData] = useState<ManagedAuthToolkit[] | null>(null);
  const [tab, setTab] = useState<'managed' | 'unmanaged'>('managed');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    fetch('/data/toolkits.json')
      .then((res) => res.json())
      .then((all: ManagedAuthToolkit[]) => {
        setData(all.filter((t) => t.authSchemes?.some((s) => s.toUpperCase().includes('OAUTH'))));
      });
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const s = deferredSearch.toLowerCase();
    const list = s
      ? data.filter((t) => t.name.toLowerCase().includes(s) || t.slug.toLowerCase().includes(s))
      : data;
    return [...list].sort((a, b) => a.name.trim().localeCompare(b.name.trim()));
  }, [data, deferredSearch]);

  const managed = useMemo(
    () => filtered.filter((t) => t.composioManagedAuthSchemes && t.composioManagedAuthSchemes.length > 0),
    [filtered]
  );
  const notManaged = useMemo(
    () => filtered.filter((t) => !t.composioManagedAuthSchemes || t.composioManagedAuthSchemes.length === 0),
    [filtered]
  );

  // Auto-switch tab when search leaves current tab empty but other has results
  const prevSearch = useRef(deferredSearch);
  useEffect(() => {
    if (deferredSearch !== prevSearch.current) {
      prevSearch.current = deferredSearch;
      if (tab === 'managed' && managed.length === 0 && notManaged.length > 0) {
        setTab('unmanaged');
      } else if (tab === 'unmanaged' && notManaged.length === 0 && managed.length > 0) {
        setTab('managed');
      }
    }
  }, [deferredSearch, tab, managed.length, notManaged.length]);

  const activeList = tab === 'managed' ? managed : notManaged;

  if (!data) {
    return <p className="py-8 text-center text-sm text-fd-muted-foreground">Loading toolkits...</p>;
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fd-muted-foreground" />
        <input
          type="text"
          placeholder="Search toolkits..."
          autoComplete="off"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-full rounded-lg border border-fd-border bg-fd-background pl-10 pr-4 text-sm text-fd-foreground placeholder:text-fd-muted-foreground focus:outline-none focus-visible:border-orange-500/50 focus-visible:ring-2 focus-visible:ring-orange-500/20"
        />
      </div>

      {/* Tabs + Copy */}
      <div className="flex items-center justify-between border-b border-fd-border">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab('managed')}
            className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === 'managed'
                ? 'border-green-500 text-fd-foreground'
                : 'border-transparent text-fd-muted-foreground hover:text-fd-foreground'
            }`}
          >
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            Composio Managed App Available
            <span className="rounded-full bg-fd-muted px-1.5 py-0.5 text-xs">{managed.length}</span>
          </button>
          <button
            onClick={() => setTab('unmanaged')}
            className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === 'unmanaged'
                ? 'border-amber-500 text-fd-foreground'
                : 'border-transparent text-fd-muted-foreground hover:text-fd-foreground'
            }`}
          >
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            Requires your own credentials
            <span className="rounded-full bg-fd-muted px-1.5 py-0.5 text-xs">{notManaged.length}</span>
          </button>
        </div>
        <CopyButton toolkits={activeList} />
      </div>

      {/* List */}
      {activeList.length > 0 ? (
        <div className="divide-y divide-fd-border">
          {activeList.map((t) => (
            <ToolkitRow key={t.slug} toolkit={t} />
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-fd-muted-foreground">No toolkits found.</p>
      )}
    </div>
  );
}
