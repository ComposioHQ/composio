'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ExternalLink, Search, Copy, Check, ChevronDown, ChevronRight, ArrowLeft } from 'lucide-react';
import type { Toolkit, Tool, Trigger } from '@/types/toolkit';

interface ToolkitDetailProps {
  toolkit: Toolkit;
  tools: Tool[];
  triggers: Trigger[];
}

function ToolkitIcon({ toolkit }: { toolkit: Toolkit }) {
  return (
    <div
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-fd-border bg-fd-card bg-center bg-no-repeat text-xl font-semibold text-fd-muted-foreground shadow-sm"
      style={toolkit.logo ? {
        backgroundImage: `url(${toolkit.logo})`,
        backgroundSize: '60%',
      } : undefined}
    >
      {!toolkit.logo && toolkit.name.trim().charAt(0).toUpperCase()}
    </div>
  );
}

function ToolItem({ item }: { item: Tool | Trigger }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const copySlug = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(item.slug);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-b border-fd-border/50 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="group flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-fd-accent/30"
      >
        <span className="shrink-0 text-fd-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          <span className="truncate text-sm font-medium text-fd-foreground">{item.name}</span>
          <span
            role="button"
            onClick={copySlug}
            className="inline-flex w-fit shrink-0 items-center gap-1 rounded bg-fd-muted px-1.5 py-0.5 font-mono text-xs text-fd-muted-foreground transition-colors hover:text-fd-foreground"
          >
            <span className="max-w-[200px] truncate sm:max-w-[300px]">{item.slug}</span>
            {copied ? <Check className="h-3 w-3 shrink-0 text-green-500" /> : <Copy className="h-3 w-3 shrink-0" />}
          </span>
        </span>
      </button>
      {expanded && (
        <div className="bg-fd-muted/20 px-4 py-3 pl-10">
          <p className="text-sm text-fd-muted-foreground">{item.description}</p>
        </div>
      )}
    </div>
  );
}

export function ToolkitDetail({ toolkit, tools, triggers }: ToolkitDetailProps) {
  const [copied, setCopied] = useState(false);
  const [versionCopied, setVersionCopied] = useState(false);
  const [toolSearch, setToolSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'tools' | 'triggers'>('tools');

  const filteredTools = useMemo(() => {
    if (!toolSearch) return tools;
    const search = toolSearch.toLowerCase();
    return tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(search) ||
        tool.slug.toLowerCase().includes(search) ||
        tool.description.toLowerCase().includes(search)
    );
  }, [tools, toolSearch]);

  const filteredTriggers = useMemo(() => {
    if (!toolSearch) return triggers;
    const search = toolSearch.toLowerCase();
    return triggers.filter(
      (trigger) =>
        trigger.name.toLowerCase().includes(search) ||
        trigger.slug.toLowerCase().includes(search) ||
        trigger.description.toLowerCase().includes(search)
    );
  }, [triggers, toolSearch]);

  const copySlug = () => {
    navigator.clipboard.writeText(toolkit.slug.toUpperCase());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyVersion = () => {
    if (toolkit.version) {
      navigator.clipboard.writeText(toolkit.version);
      setVersionCopied(true);
      setTimeout(() => setVersionCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-8">
      {/* Back navigation */}
      <Link
        href="/toolkits"
        className="inline-flex items-center gap-1.5 text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All Toolkits
      </Link>

      {/* Header */}
      <div className="flex gap-4">
          <ToolkitIcon toolkit={toolkit} />
          <div className="min-w-0 flex-1">
            {/* Title row */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-fd-foreground">{toolkit.name.trim()}</h1>
                <button
                  onClick={copySlug}
                  className="inline-flex items-center gap-1 rounded bg-fd-muted px-1.5 py-0.5 font-mono text-xs text-fd-muted-foreground transition-colors hover:text-fd-foreground"
                >
                  {toolkit.slug.toUpperCase()}
                  {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
              {toolkit.version && (
                <div className="flex items-center gap-2 text-sm text-fd-muted-foreground">
                  <span>Latest version</span>
                  <button
                    onClick={copyVersion}
                    className="inline-flex items-center gap-1 rounded border border-orange-500/30 bg-orange-500/10 px-1.5 py-0.5 font-mono text-xs text-orange-600 transition-colors hover:bg-orange-500/20 dark:text-orange-400"
                  >
                    {toolkit.version}
                    {versionCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              )}
            </div>

            {/* Description */}
            <p className="mt-1.5 text-sm text-fd-muted-foreground">{toolkit.description}</p>

            {/* Actions */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`https://platform.composio.dev/auth?next_page=${encodeURIComponent(`/tool-router?toolkits=${toolkit.slug}`)}`}
                  target="_blank"
                  className="inline-flex items-center gap-1.5 rounded-md border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-sm font-medium text-orange-600 transition-colors hover:bg-orange-500/20 dark:text-orange-400"
                >
                  Try {toolkit.name.trim()}
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
                <Link
                  href="/docs/authenticating-tools"
                  className="inline-flex items-center gap-1.5 rounded-md border border-fd-border bg-fd-background px-3 py-1.5 text-sm font-medium text-fd-foreground transition-colors hover:bg-fd-accent"
                >
                  Authentication guide
                </Link>
              </div>
              {toolkit.authSchemes.length > 0 && (
                <div className="flex items-center gap-1.5 text-sm text-fd-muted-foreground">
                  <span>Auth:</span>
                  {toolkit.authSchemes.map((scheme, index) => (
                    <span
                      key={`${scheme}-${index}`}
                      className="rounded bg-fd-muted px-1.5 py-0.5 text-xs text-fd-foreground"
                    >
                      {scheme}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
      </div>

      {/* Tools & Triggers */}
      {(tools.length > 0 || triggers.length > 0) && (
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex items-center gap-6 border-b border-fd-border">
            <button
              onClick={() => setActiveTab('tools')}
              className={`relative pb-2.5 text-sm font-medium transition-colors ${
                activeTab === 'tools'
                  ? 'text-fd-foreground'
                  : 'text-fd-muted-foreground hover:text-fd-foreground'
              }`}
            >
              Tools ({tools.length})
              {activeTab === 'tools' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />
              )}
            </button>
            {triggers.length > 0 && (
              <button
                onClick={() => setActiveTab('triggers')}
                className={`relative pb-2.5 text-sm font-medium transition-colors ${
                  activeTab === 'triggers'
                    ? 'text-fd-foreground'
                    : 'text-fd-muted-foreground hover:text-fd-foreground'
                }`}
              >
                Triggers ({triggers.length})
                {activeTab === 'triggers' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />
                )}
              </button>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fd-muted-foreground" />
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={toolSearch}
              onChange={(e) => setToolSearch(e.target.value)}
              className="h-9 w-full rounded-md border border-fd-border bg-fd-background pl-9 pr-4 text-sm text-fd-foreground placeholder:text-fd-muted-foreground focus:border-fd-primary focus:outline-none focus:ring-1 focus:ring-fd-primary"
            />
          </div>

          {/* List */}
          <div className="overflow-hidden rounded-md border border-fd-border">
            {activeTab === 'tools' && (
              filteredTools.length > 0 ? (
                filteredTools.map((tool) => (
                  <ToolItem key={tool.slug} item={tool} />
                ))
              ) : (
                <p className="px-4 py-8 text-center text-sm text-fd-muted-foreground">
                  No tools found
                </p>
              )
            )}
            {activeTab === 'triggers' && (
              filteredTriggers.length > 0 ? (
                filteredTriggers.map((trigger) => (
                  <ToolItem key={trigger.slug} item={trigger} />
                ))
              ) : (
                <p className="px-4 py-8 text-center text-sm text-fd-muted-foreground">
                  No triggers found
                </p>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
