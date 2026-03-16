'use client';

import { useState } from 'react';
import type { MetaTool, MetaToolParameter, MetaToolSchema } from '@/lib/meta-tools-data';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from 'fumadocs-ui/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';

const TAG_LABELS: Record<string, { label: string; className: string }> = {
  readOnlyHint: {
    label: 'Read-only',
    className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  },
  destructiveHint: {
    label: 'Destructive',
    className: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
  },
  idempotentHint: {
    label: 'Idempotent',
    className: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
  },
  openWorldHint: {
    label: 'External',
    className: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20',
  },
  important: {
    label: 'Important',
    className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  },
};

/** Extract the required field names array from a schema-like object */
function getRequiredFields(schema: unknown): string[] {
  if (!schema || typeof schema !== 'object') return [];
  const req = (schema as Record<string, unknown>).required;
  return Array.isArray(req) ? req : [];
}

function TagBadge({ tag }: { tag: string }) {
  const info = TAG_LABELS[tag];
  if (!info) return null;
  return (
    <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium', info.className)}>
      {info.label}
    </span>
  );
}

function ParameterRow({ name, param, isLast, showRequired = true, isRequired = false }: { name: string; param: MetaToolParameter; isLast: boolean; showRequired?: boolean; isRequired?: boolean }) {
  const hasNested = param.properties && Object.keys(param.properties).length > 0;
  const items = param.items && typeof param.items === 'object' ? param.items as Record<string, unknown> : null;
  const itemsHaveProperties = items && typeof items.properties === 'object' && Object.keys(items.properties as object).length > 0;
  const [isOpen, setIsOpen] = useState(false);

  // Show array<itemType> for simple item types
  const typeLabel = param.type === 'array' && items?.type && !itemsHaveProperties
    ? `array<${items.type}>`
    : param.type;

  return (
    <div className={cn(!isLast && 'border-b border-fd-border')}>
      <div className="py-3">
        <div className="flex flex-wrap items-center gap-2">
          <code className="text-sm font-semibold font-mono text-fd-foreground">{name}</code>
          <span className="text-xs font-mono text-fd-muted-foreground">{typeLabel}</span>
          {showRequired && isRequired && (
            <span className="text-xs font-medium text-red-500 dark:text-red-400">Required</span>
          )}
          {param.default !== undefined && param.default !== null && param.default !== '' && (
            <span className="text-xs text-fd-muted-foreground">
              Default: <code className="rounded border border-fd-border px-1 py-0.5 text-xs">{String(param.default)}</code>
            </span>
          )}
        </div>
        {param.description && (
          <p className="mt-1.5 text-sm text-fd-muted-foreground leading-relaxed">
            {param.description.replace(/\*\*/g, '').replace(/__/g, '').replace(/\n+/g, ' ').trim()}
          </p>
        )}
        {param.enum && param.enum.length > 0 && (
          <div className="mt-2">
            <span className="text-xs text-fd-muted-foreground">Possible values: </span>
            <span className="inline-flex flex-wrap gap-1 mt-0.5">
              {param.enum.map((v) => (
                <code key={v} className="rounded border border-fd-border px-1.5 py-0.5 text-xs font-mono text-fd-muted-foreground">
                  {v}
                </code>
              ))}
            </span>
          </div>
        )}
        {(hasNested || itemsHaveProperties) && (
          <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-2">
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-fd-muted-foreground hover:text-fd-foreground font-medium transition-colors">
              {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {hasNested
                ? `Show ${Object.keys(param.properties!).length} properties`
                : `Show ${Object.keys((items!.properties as object)).length} item properties`}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 pl-3 border-l-2 border-fd-border">
                <ParameterList
                  parameters={(hasNested ? param.properties! : items!.properties) as Record<string, MetaToolParameter>}
                  requiredFields={getRequiredFields(hasNested ? param : items)}
                  showRequired={showRequired}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
}

function ParameterList({ parameters, requiredFields = [], showRequired = true }: { parameters: Record<string, MetaToolParameter>; requiredFields?: string[]; showRequired?: boolean }) {
  const entries = Object.entries(parameters);
  return (
    <div>
      {entries.map(([name, param], idx) => (
        <ParameterRow key={name} name={name} param={param} isLast={idx === entries.length - 1} showRequired={showRequired} isRequired={requiredFields.includes(name)} />
      ))}
    </div>
  );
}

function SchemaSection({ title, schema, showRequired = true }: { title: string; schema: MetaToolSchema; showRequired?: boolean }) {
  const properties = schema.properties || {};
  const entries = Object.entries(properties);

  if (entries.length === 0) return null;

  return (
    <div>
      <h3 className="text-base font-semibold text-fd-foreground mb-3">{title}</h3>
      <div className="rounded-lg border border-fd-border bg-fd-card">
        <div className="px-4">
          <ParameterList parameters={properties} requiredFields={schema.required || []} showRequired={showRequired} />
        </div>
      </div>
    </div>
  );
}

export function MetaToolDetail({ tool }: { tool: MetaTool }) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        {tool.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {tool.tags.map((tag) => (
              <TagBadge key={tag} tag={tag} />
            ))}
          </div>
        )}
        <code className="text-sm font-mono text-fd-muted-foreground">{tool.slug}</code>
      </div>

      {/* Input Parameters */}
      <SchemaSection title="Input Parameters" schema={tool.inputParameters} />

      {/* Response */}
      <SchemaSection title="Response" schema={tool.responseSchema} showRequired={false} />
    </div>
  );
}
