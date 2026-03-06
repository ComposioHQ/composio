'use client';

import { useState, useMemo, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { ExternalLink, Search, Copy, Check, ChevronDown, ChevronRight, ArrowLeft } from 'lucide-react';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import type { Toolkit, Tool, Trigger, ParameterSchema } from '@/types/toolkit';
import { processSchema } from '@/lib/toolkit-schema';
import { PageActions } from '@/components/page-actions';
import { AuthDetailsSection } from '@/components/toolkits/auth-details-section';
import { FaqSection, type FaqItem } from '@/components/toolkits/faq-section';

interface ToolkitDetailProps {
  toolkit: Toolkit;
  tools: Tool[];
  triggers: Trigger[];
  path: string;
  faq?: FaqItem[] | null;
}

function ToolkitIcon({ toolkit }: { toolkit: Toolkit }) {
  const [imgFailed, setImgFailed] = useState(false);
  const fallback = (toolkit.name?.trim() || toolkit.slug).charAt(0).toUpperCase();

  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-fd-border bg-fd-card text-xl font-semibold text-fd-muted-foreground shadow-sm">
      {toolkit.logo && !imgFailed ? (
        <img
          src={toolkit.logo}
          alt=""
          className="h-[60%] w-[60%] object-contain"
          onError={() => setImgFailed(true)}
        />
      ) : (
        fallback
      )}
    </div>
  );
}

// Format default value for display
function formatDefault(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// Format type with enum values if available
function formatType(param: ParameterSchema): string {
  let typeStr = param.type || 'string';

  // Show array item type
  if (typeStr === 'array' && param.items) {
    const itemType = param.items.type || 'unknown';
    typeStr = `array<${itemType}>`;
  }

  // Include enum values in type display
  if (param.enum && param.enum.length > 0) {
    const enumValues = param.enum.map(v => `"${v}"`).join(' | ');
    typeStr = `${typeStr} (${enumValues})`;
  }

  return typeStr;
}

// Get children from a param (object properties or array item properties)
function getChildren(param: ParameterSchema): Record<string, ParameterSchema> | null {
  const props = param.properties || param.items?.properties;
  if (!props || typeof props !== 'object') return null;

  const requiredList: string[] = param.requiredFields || param.items?.requiredFields || [];
  const result: Record<string, ParameterSchema> = {};
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'object' && value !== null) {
      const raw = value as ParameterSchema & { required?: string[] | boolean };
      result[key] = {
        ...raw,
        required: Array.isArray(requiredList) ? requiredList.includes(key) : false,
        // Map the child's own JSON Schema required array to requiredFields
        // so that deeper nesting levels preserve required info
        ...(Array.isArray(raw.required) ? { requiredFields: raw.required } : {}),
      };
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

// Build a ReactNode description that includes text + nested TypeTable for children
function buildDescription(param: ParameterSchema): ReactNode {
  const children = getChildren(param);
  if (!children) return param.description || undefined;

  return (
    <div className="space-y-2">
      {param.description && <p>{param.description}</p>}
      <TypeTable type={paramsToTypeTable(children)} />
    </div>
  );
}

// Convert parameter schema to TypeTable format, recursively nesting child TypeTables in descriptions
function paramsToTypeTable(params: Record<string, ParameterSchema>): Record<string, {
  type: string;
  description?: ReactNode;
  default?: string;
  required?: boolean;
}> {
  const result: Record<string, { type: string; description?: ReactNode; default?: string; required?: boolean }> = {};
  for (const [name, param] of Object.entries(params)) {
    result[name] = {
      type: formatType(param),
      description: buildDescription(param),
      default: formatDefault(param.default),
      required: param.required,
    };
  }
  return result;
}


// Check if item is a Tool with parameters
function isTool(item: Tool | Trigger): item is Tool {
  return 'input_parameters' in item || 'output_parameters' in item;
}

// Check if item is a Trigger with config/payload
function isTrigger(item: Tool | Trigger): item is Trigger {
  return 'config' in item || 'payload' in item || 'type' in item;
}

function ToolItem({ item, toolkitVersion }: { item: Tool | Trigger; toolkitVersion?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [detailedParams, setDetailedParams] = useState<{
    input?: Record<string, ParameterSchema>;
    output?: Record<string, ParameterSchema>;
  } | null>(null);
  const [fetched, setFetched] = useState(false);

  const copySlug = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(item.slug);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tool = isTool(item) ? item : null;
  const trigger = isTrigger(item) ? item : null;

  // Fetch detailed schema once when a tool is first expanded
  useEffect(() => {
    if (!expanded || !tool || fetched) return;
    setFetched(true);
    const versionParam = toolkitVersion ? `?version=${encodeURIComponent(toolkitVersion)}` : '';
    fetch(`/api/tools/${item.slug}${versionParam}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setDetailedParams({
            input: processSchema(data.input_parameters),
            output: processSchema(data.output_parameters),
          });
        }
      })
      .catch(() => {
        // silently fall back to basic params
      });
  }, [expanded, tool, fetched, item.slug, toolkitVersion]);

  const inputParams = detailedParams?.input || tool?.input_parameters;
  const outputParams = detailedParams?.output || tool?.output_parameters;

  const hasInputParams = inputParams && Object.keys(inputParams).length > 0;
  const hasOutputParams = outputParams && Object.keys(outputParams).length > 0;
  const hasConfig = trigger?.config && Object.keys(trigger.config).length > 0;
  const hasPayload = trigger?.payload && Object.keys(trigger.payload).length > 0;

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
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-fd-foreground">{item.name}</span>
            {trigger?.type && (
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${
                trigger.type === 'webhook'
                  ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                  : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
              }`}>
                {trigger.type}
              </span>
            )}
          </span>
          <span
            role="button"
            onClick={copySlug}
            className="inline-flex w-fit shrink-0 items-center gap-1 rounded bg-fd-muted px-1.5 py-0.5 font-mono text-xs text-fd-muted-foreground transition-colors hover:text-fd-foreground"
          >
            <span className="max-w-[140px] truncate sm:max-w-[300px]">{item.slug}</span>
            {copied ? <Check className="h-3 w-3 shrink-0 text-green-500" /> : <Copy className="h-3 w-3 shrink-0" />}
          </span>
        </span>
      </button>
      {expanded && (
        <div className="space-y-4 bg-fd-muted/20 px-3 py-3 sm:px-4 sm:pl-10">
          <p className="text-sm text-fd-muted-foreground">{item.description}</p>

          {/* Tool parameters */}
          {hasInputParams && (
            <div className="space-y-2 overflow-x-auto">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-fd-muted-foreground">Input Parameters</h4>
              <TypeTable type={paramsToTypeTable(inputParams!)} />
            </div>
          )}

          {hasOutputParams && (
            <div className="space-y-2 overflow-x-auto">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-fd-muted-foreground">Output</h4>
              <TypeTable type={paramsToTypeTable(outputParams!)} />
            </div>
          )}

          {/* Trigger config/payload */}
          {hasConfig && (
            <div className="space-y-2 overflow-x-auto">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-fd-muted-foreground">Configuration</h4>
              <TypeTable type={paramsToTypeTable(trigger.config!)} />
            </div>
          )}

          {hasPayload && (
            <div className="space-y-2 overflow-x-auto">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-fd-muted-foreground">Payload</h4>
              <TypeTable type={paramsToTypeTable(trigger.payload!)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ToolkitDetail({ toolkit, tools, triggers, path, faq }: ToolkitDetailProps) {
  const [copied, setCopied] = useState(false);
  const [versionCopied, setVersionCopied] = useState(false);
  const [toolSearch, setToolSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'tools' | 'triggers'>('tools');

  const filteredTools = useMemo(() => {
    const toolsArray = tools || [];
    if (!toolSearch) return toolsArray;
    const search = toolSearch.toLowerCase();
    return toolsArray.filter(
      (tool) =>
        tool.name?.toLowerCase().includes(search) ||
        tool.slug?.toLowerCase().includes(search)
    );
  }, [tools, toolSearch]);

  const filteredTriggers = useMemo(() => {
    const triggersArray = triggers || [];
    if (!toolSearch) return triggersArray;
    const search = toolSearch.toLowerCase();
    return triggersArray.filter(
      (trigger) =>
        trigger.name?.toLowerCase().includes(search) ||
        trigger.slug?.toLowerCase().includes(search)
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
          <ToolkitIcon key={toolkit.slug} toolkit={toolkit} />
          <div className="min-w-0 flex-1">
            {/* Title row */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-fd-foreground">{(toolkit.name?.trim() || toolkit.slug)}</h1>
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
                  href={`https://platform.composio.dev/marketplace/${toolkit.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-sm font-medium text-orange-600 transition-colors hover:bg-orange-500/20 dark:text-orange-400"
                >
                  Try {(toolkit.name?.trim() || toolkit.slug)}
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>

            {/* Page actions */}
            <PageActions path={path} />
          </div>
      </div>

      {/* Authentication Details */}
      {toolkit.authConfigDetails && toolkit.authConfigDetails.length > 0 && (
        <AuthDetailsSection authConfigDetails={toolkit.authConfigDetails} authSchemes={toolkit.authSchemes} composioManagedAuthSchemes={toolkit.composioManagedAuthSchemes} />
      )}

      {/* FAQ */}
      {faq && faq.length > 0 && <FaqSection faq={faq} />}

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
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fd-muted-foreground" aria-hidden="true" />
            <input
              type="text"
              name="tool-search"
              aria-label={`Search ${activeTab}`}
              placeholder={`Search ${activeTab}…`}
              autoComplete="off"
              value={toolSearch}
              onChange={(e) => setToolSearch(e.target.value)}
              className="h-9 w-full rounded-md border border-fd-border bg-fd-background pl-9 pr-4 text-sm text-fd-foreground placeholder:text-fd-muted-foreground focus:outline-none focus-visible:border-orange-500/50 focus-visible:ring-2 focus-visible:ring-orange-500/20"
            />
          </div>

          {/* List */}
          <div className="overflow-hidden rounded-md border border-fd-border">
            {activeTab === 'tools' && (
              filteredTools.length > 0 ? (
                filteredTools.map((tool) => (
                  <ToolItem key={tool.slug} item={tool} toolkitVersion={toolkit.version} />
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
                  <ToolItem key={trigger.slug} item={trigger} toolkitVersion={toolkit.version} />
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
