'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ExternalLink, Search, Copy, Check, ChevronDown, ChevronRight, ArrowLeft } from 'lucide-react';
import type { Toolkit, Tool, Trigger, ParametersSchema, SchemaProperty, AuthConfigDetail, AuthField } from '@/types/toolkit';

interface ToolkitDetailProps {
  toolkit: Toolkit;
  tools: Tool[];
  triggers: Trigger[];
}

function getTypeString(prop: SchemaProperty): string {
  if (Array.isArray(prop.type)) {
    return prop.type.join(' | ');
  }
  if (prop.type === 'array' && prop.items) {
    const itemType = getTypeString(prop.items);
    return `${itemType}[]`;
  }
  return prop.type || 'any';
}

function SchemaTable({ schema, title }: { schema: ParametersSchema; title: string }) {
  if (!schema?.properties || Object.keys(schema.properties).length === 0) {
    return null;
  }

  const requiredFields = new Set(schema.required || []);

  return (
    <div className="mt-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fd-muted-foreground">
        {title}
      </h4>
      <div className="overflow-x-auto rounded-md border border-fd-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-fd-border bg-fd-muted/50">
              <th className="px-3 py-2 text-left font-medium text-fd-foreground">Name</th>
              <th className="px-3 py-2 text-left font-medium text-fd-foreground">Type</th>
              <th className="px-3 py-2 text-left font-medium text-fd-foreground">Description</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(schema.properties).map(([name, prop]) => (
              <tr key={name} className="border-b border-fd-border/50 last:border-0">
                <td className="px-3 py-2 align-top">
                  <code className="rounded bg-fd-muted px-1 py-0.5 text-xs">{name}</code>
                  {requiredFields.has(name) && (
                    <span className="ml-1 text-xs text-orange-500">*</span>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <code className="text-xs text-fd-muted-foreground">{getTypeString(prop)}</code>
                </td>
                <td className="px-3 py-2 align-top text-fd-muted-foreground">
                  {prop.description || '—'}
                  {prop.default !== undefined && (
                    <span className="ml-2 text-xs">
                      (default: <code className="rounded bg-fd-muted px-1">{String(prop.default)}</code>)
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuthFieldsTable({ fields, title }: { fields: AuthField[]; title: string }) {
  if (!fields || fields.length === 0) return null;

  return (
    <div className="mt-3">
      <h5 className="mb-2 text-xs font-medium text-fd-muted-foreground">{title}</h5>
      <div className="overflow-x-auto rounded-md border border-fd-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-fd-border bg-fd-muted/50">
              <th className="px-3 py-2 text-left font-medium text-fd-foreground">Field</th>
              <th className="px-3 py-2 text-left font-medium text-fd-foreground">Type</th>
              <th className="px-3 py-2 text-left font-medium text-fd-foreground">Description</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field.name} className="border-b border-fd-border/50 last:border-0">
                <td className="px-3 py-2 align-top">
                  <code className="rounded bg-fd-muted px-1 py-0.5 text-xs">{field.displayName || field.name}</code>
                  {field.required && <span className="ml-1 text-xs text-orange-500">*</span>}
                </td>
                <td className="px-3 py-2 align-top">
                  <code className="text-xs text-fd-muted-foreground">{field.type}</code>
                </td>
                <td className="px-3 py-2 align-top text-fd-muted-foreground">
                  {field.description || '—'}
                  {field.default && (
                    <span className="ml-2 text-xs">
                      (default: <code className="rounded bg-fd-muted px-1">{field.default.length > 50 ? field.default.slice(0, 50) + '...' : field.default}</code>)
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuthConfigSection({ authConfigDetails }: { authConfigDetails: AuthConfigDetail[] }) {
  const [expanded, setExpanded] = useState(false);

  if (!authConfigDetails || authConfigDetails.length === 0) return null;

  return (
    <div className="rounded-md border border-fd-border">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-fd-accent/30"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-fd-foreground">Authentication Configuration</span>
          <span className="rounded bg-fd-muted px-1.5 py-0.5 text-xs text-fd-muted-foreground">
            {authConfigDetails.length} {authConfigDetails.length === 1 ? 'scheme' : 'schemes'}
          </span>
        </div>
        <span className="text-fd-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-fd-border bg-fd-muted/20 px-4 py-4 space-y-6">
          {authConfigDetails.map((config) => (
            <div key={config.name}>
              <div className="flex items-center gap-2 mb-3">
                <h4 className="text-sm font-medium text-fd-foreground">{config.name}</h4>
                <span className="rounded bg-orange-500/10 border border-orange-500/30 px-1.5 py-0.5 text-xs text-orange-600 dark:text-orange-400">
                  {config.mode}
                </span>
              </div>

              {config.fields.auth_config_creation && (
                <div className="mb-4">
                  <h5 className="text-xs font-semibold uppercase tracking-wide text-fd-muted-foreground mb-2">
                    Auth Config Creation
                  </h5>
                  <AuthFieldsTable fields={config.fields.auth_config_creation.required} title="Required Fields" />
                  <AuthFieldsTable fields={config.fields.auth_config_creation.optional} title="Optional Fields" />
                </div>
              )}

              {config.fields.connected_account_initiation && (
                <div>
                  <h5 className="text-xs font-semibold uppercase tracking-wide text-fd-muted-foreground mb-2">
                    Account Connection
                  </h5>
                  <AuthFieldsTable fields={config.fields.connected_account_initiation.required} title="Required Fields" />
                  <AuthFieldsTable fields={config.fields.connected_account_initiation.optional} title="Optional Fields" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
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

  // Type guard to check if item is a Tool
  const isTool = (item: Tool | Trigger): item is Tool => {
    return 'inputParameters' in item || 'outputParameters' in item;
  };

  // Type guard to check if item is a Trigger
  const isTrigger = (item: Tool | Trigger): item is Trigger => {
    return 'payload' in item;
  };

  const hasToolParams = isTool(item) && (item.inputParameters || item.outputParameters);
  const hasTriggerPayload = isTrigger(item) && item.payload;

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

          {/* Show input/output parameters for Tools */}
          {isTool(item) && hasToolParams && (
            <div className="mt-4 space-y-4">
              {item.inputParameters && (
                <SchemaTable schema={item.inputParameters} title="Input Parameters" />
              )}
              {item.outputParameters && (
                <SchemaTable schema={item.outputParameters} title="Output Response" />
              )}
            </div>
          )}

          {/* Show payload for Triggers */}
          {isTrigger(item) && hasTriggerPayload && (
            <div className="mt-4">
              <SchemaTable schema={item.payload!} title="Payload" />
            </div>
          )}
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

      {/* Authentication Configuration */}
      {toolkit.authConfigDetails && toolkit.authConfigDetails.length > 0 && (
        <AuthConfigSection authConfigDetails={toolkit.authConfigDetails} />
      )}

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
