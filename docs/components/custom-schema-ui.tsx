'use client';

import { createContext, Fragment, use, useState } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from 'fumadocs-ui/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { Plus, X } from 'lucide-react';
import type { SchemaData, SchemaUIGeneratedData } from './schema-generator';

interface SchemaUIProps {
  name: string;
  required?: boolean;
  as?: 'property' | 'body';
  generated: SchemaUIGeneratedData;
  isResponse?: boolean;
}

const DataContext = createContext<SchemaUIGeneratedData | null>(null);
const ResponseContext = createContext(false);

function useData() {
  const ctx = use(DataContext);
  if (!ctx) throw new Error('Missing DataContext');
  return ctx;
}

function useIsResponse() {
  return use(ResponseContext);
}

export function CustomSchemaUI({
  name,
  required = false,
  as = 'property',
  generated,
  isResponse = false,
}: SchemaUIProps) {
  const schema = generated.refs[generated.$root];
  const isProperty = as === 'property' || !isExpandable(schema, generated.refs);

  return (
    <DataContext value={generated}>
      <ResponseContext value={isResponse}>
        {isProperty ? (
          <SchemaProperty
            name={name}
            $type={generated.$root}
            required={required}
            isRoot
          />
        ) : (
          <SchemaContent $type={generated.$root} />
        )}
      </ResponseContext>
    </DataContext>
  );
}

function SchemaContent({
  $type,
  parentPath = '',
}: {
  $type: string;
  parentPath?: string;
}) {
  const { refs } = useData();
  const schema = refs[$type];

  if (schema.type === 'object' && schema.props.length > 0) {
    return (
      <div className="divide-y divide-fd-border">
        {schema.props.map((prop) => (
          <SchemaProperty
            key={prop.name}
            name={prop.name}
            $type={prop.$type}
            required={prop.required}
            parentPath={parentPath}
          />
        ))}
      </div>
    );
  }

  if (schema.type === 'array') {
    return <SchemaContent $type={schema.item.$type} parentPath={parentPath} />;
  }

  if ((schema.type === 'or' || schema.type === 'and') && schema.items.length > 0) {
    const label = schema.type === 'or' ? 'One of:' : 'All of:';
    return (
      <div className="space-y-2">
        <p className="text-xs text-fd-muted-foreground">{label}</p>
        {schema.items.map((item, i) => (
          <div key={`${item.$type}-${i}`} className="pl-3 border-l-2 border-fd-border">
            <span className="text-sm font-medium">{item.name}</span>
            {isExpandable(refs[item.$type], refs) && (
              <ExpandableContent $type={item.$type} parentPath={parentPath} />
            )}
          </div>
        ))}
      </div>
    );
  }

  return null;
}

function SchemaProperty({
  name,
  $type,
  required,
  parentPath = '',
  isRoot = false,
}: {
  name: string;
  $type: string;
  required: boolean;
  parentPath?: string;
  isRoot?: boolean;
}) {
  const { refs } = useData();
  const isResponse = useIsResponse();
  const schema = refs[$type];
  const fullPath = parentPath ? `${parentPath}.${name}` : name;

  const hasChildren = isExpandable(schema, refs);
  const typeDisplay = getTypeDisplay(schema);

  return (
    <div className={cn('py-4', !isRoot && 'first:pt-0')}>
      {/* Property header */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium font-mono text-fd-foreground">
          {name}
        </span>
        <span className="text-sm font-mono text-fd-muted-foreground">
          {typeDisplay}
        </span>
        {required && !isResponse && (
          <span className="text-xs text-red-400 font-medium">Required</span>
        )}
        {schema.deprecated && (
          <span className="text-xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 px-1.5 py-0.5 rounded">
            Deprecated
          </span>
        )}
      </div>

      {/* Description */}
      {schema.description && (
        <div className="mt-2 text-sm text-fd-muted-foreground prose-no-margin">
          {schema.description}
        </div>
      )}

      {/* Info tags */}
      {schema.infoTags && schema.infoTags.length > 0 && (
        <div className="flex flex-row gap-2 flex-wrap mt-2">
          {schema.infoTags.map((tag, i) => (
            <Fragment key={i}>{tag}</Fragment>
          ))}
        </div>
      )}

      {/* Enum values */}
      {schema.enumValues && schema.enumValues.length > 0 && (
        <EnumValues values={schema.enumValues} />
      )}

      {/* Expandable child attributes */}
      {hasChildren && (
        <ExpandableContent $type={$type} parentPath={fullPath} />
      )}
    </div>
  );
}

function EnumValues({ values }: { values: string[] }) {
  return (
    <div className="mt-2">
      <span className="text-xs text-fd-muted-foreground">Possible values:</span>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {values.map((value) => (
          <code
            key={value}
            className="rounded border border-fd-border px-1.5 py-0.5 text-xs font-mono text-fd-muted-foreground"
          >
            {value}
          </code>
        ))}
      </div>
    </div>
  );
}

function ExpandableContent({
  $type,
  parentPath,
}: {
  $type: string;
  parentPath: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { refs } = useData();
  const schema = refs[$type];

  const childCount = getChildCount(schema);
  const label = schema.type === 'array' ? 'item properties' : 'child attributes';

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-3">
      <CollapsibleTrigger className="group flex items-center gap-1 px-2 py-1 text-xs text-fd-muted-foreground hover:text-fd-foreground font-medium rounded border border-fd-border hover:bg-fd-accent/30 transition-colors">
        {isOpen ? (
          <>
            <X className="h-3 w-3" />
            Hide {label}
          </>
        ) : (
          <>
            <Plus className="h-3 w-3" />
            Show {childCount > 0 ? `${childCount} ` : ''}{label}
          </>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 pl-3 border-l border-fd-border">
          <SchemaContent $type={$type} parentPath={parentPath} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function isExpandable(
  schema: SchemaData,
  refs?: Record<string, SchemaData>,
  visited: Set<string> = new Set()
): boolean {
  if (schema.type === 'object' && schema.props.length > 0) return true;
  if (schema.type === 'array') {
    // Only expandable if items have structure (object/nested)
    if (!refs) return true;
    const itemType = schema.item.$type;
    if (visited.has(itemType)) return false; // Circular ref - not expandable
    const itemSchema = refs[itemType];
    if (!itemSchema) return false;
    return itemSchema.type !== 'primitive';
  }
  if ((schema.type === 'or' || schema.type === 'and') && schema.items.length > 0) {
    // Only expandable if at least one variant has nested structure
    if (!refs) return true;
    return schema.items.some((item) => {
      if (visited.has(item.$type)) return false; // Circular ref - not expandable
      const itemSchema = refs[item.$type];
      if (!itemSchema) return false;
      visited.add(item.$type);
      return isExpandable(itemSchema, refs, visited);
    });
  }
  return false;
}

function getTypeDisplay(schema: SchemaData): string {
  if (schema.type === 'array') {
    return `array of ${schema.aliasName}`;
  }
  return schema.typeName;
}

function getChildCount(schema: SchemaData): number {
  if (schema.type === 'object') return schema.props.length;
  if (schema.type === 'or' || schema.type === 'and') return schema.items.length;
  return 0;
}
