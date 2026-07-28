import type { ReactNode } from 'react';

// Types matching fumadocs-openapi internal structure
interface FieldBase {
  description?: ReactNode;
  infoTags?: ReactNode[];
  typeName: string;
  aliasName: string;
  deprecated?: boolean;
  experimental?: boolean;
  enumValues?: string[];
}

export type SchemaData = FieldBase &
  (
    | { type: 'primitive' }
    | {
        type: 'object';
        props: { name: string; $type: string; required: boolean }[];
      }
    | { type: 'array'; item: { $type: string } }
    | { type: 'or'; items: { name: string; $type: string }[] }
    | { type: 'and'; items: { name: string; $type: string }[] }
  );

export interface SchemaUIGeneratedData {
  $root: string;
  refs: Record<string, SchemaData>;
}

type SimpleSchema = boolean | SimpleSchemaObject;

interface SimpleSchemaObject {
  $ref?: string;
  type?: string | readonly string[];
  items?: SimpleSchema;
  oneOf?: readonly SimpleSchema[];
  anyOf?: readonly SimpleSchema[];
  allOf?: readonly SimpleSchema[];
  properties?: Readonly<Record<string, SimpleSchema>>;
  additionalProperties?: boolean | SimpleSchema;
  required?: readonly string[];
  enum?: readonly unknown[];
  description?: string;
  format?: string;
  default?: unknown;
  readOnly?: boolean;
  writeOnly?: boolean;
  deprecated?: boolean;
  'x-experimental'?: boolean;
}

interface RenderContext {
  renderMarkdown: (text: string) => ReactNode;
  schema: {
    getRawRef: (obj: object) => string | undefined;
    /**
     * Shallowly resolves a Reference Object, merging sibling keywords.
     * Non-reference values are returned unchanged.
     */
    resolve: (node: SimpleSchema) => SimpleSchema;
  };
}

interface SchemaUIOptions {
  root: SimpleSchema;
  readOnly?: boolean;
  writeOnly?: boolean;
}

/**
 * Removes the source-level marker when the schema provides a structured
 * experimental flag. Unflagged descriptions keep their original text so they
 * do not lose their only lifecycle signal.
 */
export function getSchemaDisplayDescription(description: string, experimental: boolean): string {
  if (!experimental) return description;

  return description.replace(/^\s*\[experimental\]\s*/i, '');
}

export function generateSchemaData(
  options: SchemaUIOptions,
  ctx: RenderContext
): SchemaUIGeneratedData {
  const refs: Record<string, SchemaData> = {};
  let counter = 0;
  const autoIds = new WeakMap<object, string>();

  function getSchemaId(schema: SimpleSchema): string {
    if (typeof schema === 'boolean') return String(schema);
    if (typeof schema !== 'object' || schema === null) return `__${counter++}`;
    const raw = ctx.schema.getRawRef(schema);
    if (raw) return raw;
    const prev = autoIds.get(schema);
    if (prev) return prev;
    const generated = `__${counter++}`;
    autoIds.set(schema, generated);
    return generated;
  }

  function getTypeName(schema: SimpleSchema): string {
    if (!schema || typeof schema !== 'object') return 'any';
    if (schema.$ref) {
      const refName = schema.$ref.split('/').pop() || 'object';
      return refName;
    }
    if (schema.type === 'array' && schema.items) {
      return `${getTypeName(schema.items)}[]`;
    }
    if (schema.oneOf || schema.anyOf) {
      const variants = schema.oneOf || schema.anyOf || [];
      return variants.map((v: SimpleSchema) => getTypeName(v)).join(' | ');
    }
    if (schema.enum) {
      return 'enum';
    }
    if (Array.isArray(schema.type)) {
      const isNullable = schema.type.includes('null');
      const types = schema.type.filter((t: string) => t !== 'null');
      const typeName = types.join(' | ') || 'any';
      return isNullable ? `nullable ${typeName}` : typeName;
    }
    return typeof schema.type === 'string' ? schema.type : 'any';
  }

  function isVisible(schema: SimpleSchema): boolean {
    if (!schema || typeof schema !== 'object') return true;
    // readOnly/writeOnly live on the referenced target, not the $ref node.
    const resolved = ctx.schema.resolve(schema);
    if (!resolved || typeof resolved !== 'object') return true;
    if (resolved.writeOnly) return options.writeOnly ?? false;
    if (resolved.readOnly) return options.readOnly ?? false;
    return true;
  }

  function processSchema(schema: SimpleSchema): string {
    if (!schema || typeof schema !== 'object') {
      const id = `__${counter++}`;
      refs[id] = {
        type: 'primitive',
        typeName: 'any',
        aliasName: 'any',
      };
      return id;
    }

    const id = getSchemaId(schema);
    if (id in refs) return id;

    // Mark as processing to prevent infinite recursion on circular refs
    refs[id] = { type: 'primitive', typeName: 'any', aliasName: 'any' };

    // Derive identity from the raw node so $ref-keyed dedup remains stable, but
    // read content from the resolved target.
    const resolved = ctx.schema.resolve(schema);
    if (!resolved || typeof resolved !== 'object') return id;

    // For arrays, aliasName is the item type (used in "array of X" display).
    // Display names come from the raw node so a $ref keeps its schema name.
    const aliasName =
      resolved.type === 'array' && resolved.items
        ? getTypeName(resolved.items)
        : getTypeName(schema);

    const experimental = resolved['x-experimental'] === true;
    const base: FieldBase = {
      description: resolved.description
        ? ctx.renderMarkdown(getSchemaDisplayDescription(resolved.description, experimental))
        : undefined,
      infoTags: generateInfoTags(resolved),
      typeName: getTypeName(schema),
      aliasName,
      deprecated: resolved.deprecated,
      experimental,
      enumValues: resolved.enum ? resolved.enum.map((v: unknown) => String(v)) : undefined,
    };

    // Handle oneOf/anyOf
    if (resolved.oneOf || resolved.anyOf) {
      const variants = resolved.oneOf || resolved.anyOf || [];
      refs[id] = {
        ...base,
        type: 'or',
        items: variants.map((variant: SimpleSchema) => ({
          name: getTypeName(variant),
          $type: processSchema(variant),
        })),
      };
      return id;
    }

    // Handle allOf - merge into single object
    if (resolved.allOf) {
      // Merge all schemas together. Each member may itself be a Reference
      // Object, so resolve before reading its properties.
      const mergedProperties: Record<string, SimpleSchema> = {};
      const mergedRequired: string[] = [];
      for (const rawSubSchema of resolved.allOf) {
        const subSchema = ctx.schema.resolve(rawSubSchema);
        if (!subSchema || typeof subSchema !== 'object') continue;
        if (subSchema.properties) {
          Object.assign(mergedProperties, subSchema.properties);
        }
        if (subSchema.required) {
          mergedRequired.push(...subSchema.required);
        }
      }
      if (Object.keys(mergedProperties).length > 0) {
        const props = Object.entries(mergedProperties)
          .filter(([_, propSchema]) => isVisible(propSchema))
          .map(([name, propSchema]) => ({
            name,
            $type: processSchema(propSchema),
            required: mergedRequired.includes(name),
          }));
        refs[id] = {
          ...base,
          type: 'object',
          props,
        };
        return id;
      }
    }

    // Handle object (with properties and/or additionalProperties)
    if (
      (resolved.type === 'object' || resolved.properties) &&
      (resolved.properties ||
        (resolved.additionalProperties && typeof resolved.additionalProperties === 'object'))
    ) {
      const required = resolved.required || [];
      const props: { name: string; $type: string; required: boolean }[] = [];

      if (resolved.properties) {
        for (const [name, propSchema] of Object.entries(resolved.properties)) {
          if (!isVisible(propSchema)) continue;
          props.push({
            name,
            $type: processSchema(propSchema as SimpleSchema),
            required: required.includes(name),
          });
        }
      }

      // Include additionalProperties as a synthetic [key: string] entry
      if (resolved.additionalProperties && typeof resolved.additionalProperties === 'object') {
        props.push({
          name: '[key: string]',
          $type: processSchema(resolved.additionalProperties),
          required: false,
        });
      }

      refs[id] = {
        ...base,
        type: 'object',
        props,
      };
      return id;
    }

    // Handle array
    if (resolved.type === 'array' && resolved.items) {
      refs[id] = {
        ...base,
        type: 'array',
        item: { $type: processSchema(resolved.items) },
      };
      return id;
    }

    // Primitive type
    refs[id] = {
      ...base,
      type: 'primitive',
    };
    return id;
  }

  function generateInfoTags(schema: SimpleSchemaObject): ReactNode[] {
    const tags: ReactNode[] = [];

    if (schema.default !== undefined) {
      const defaultStr = JSON.stringify(schema.default);
      // Skip empty objects/arrays as defaults - they're noise
      if (defaultStr !== '{}' && defaultStr !== '[]') {
        tags.push(
          <span key="default" className="text-xs text-fd-muted-foreground">
            Default:{' '}
            <code className="rounded border border-fd-border px-1 py-0.5 font-mono">
              {defaultStr}
            </code>
          </span>
        );
      }
    }

    if (schema.format) {
      tags.push(
        <span key="format" className="text-xs text-fd-muted-foreground">
          Format:{' '}
          <code className="rounded border border-fd-border px-1 py-0.5 font-mono">
            {schema.format}
          </code>
        </span>
      );
    }

    // Enum values are rendered separately in the UI, not as an info tag

    return tags;
  }

  const $root = processSchema(options.root);
  return { $root, refs };
}
