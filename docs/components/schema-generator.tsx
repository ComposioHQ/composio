import type { ReactNode } from 'react';

// Types matching fumadocs-openapi internal structure
interface FieldBase {
  description?: ReactNode;
  infoTags?: ReactNode[];
  typeName: string;
  aliasName: string;
  deprecated?: boolean;
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

// Simplified schema type (subset of OpenAPI schema)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SimpleSchema = any;

interface RenderContext {
  renderMarkdown: (text: string) => ReactNode;
  schema: {
    getRawRef: (obj: object) => string | undefined;
  };
}

interface SchemaUIOptions {
  root: SimpleSchema;
  readOnly?: boolean;
  writeOnly?: boolean;
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
    return schema.type || 'any';
  }

  function isVisible(schema: SimpleSchema): boolean {
    if (!schema || typeof schema !== 'object') return true;
    if (schema.writeOnly) return options.writeOnly ?? false;
    if (schema.readOnly) return options.readOnly ?? false;
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

    // For arrays, aliasName is the item type (used in "array of X" display)
    const aliasName =
      schema.type === 'array' && schema.items
        ? getTypeName(schema.items)
        : getTypeName(schema);

    const base: FieldBase = {
      description: schema.description
        ? ctx.renderMarkdown(schema.description)
        : undefined,
      infoTags: generateInfoTags(schema),
      typeName: getTypeName(schema),
      aliasName,
      deprecated: schema.deprecated,
      enumValues: schema.enum
        ? schema.enum.map((v: unknown) => String(v))
        : undefined,
    };

    // Handle oneOf/anyOf
    if (schema.oneOf || schema.anyOf) {
      const variants = schema.oneOf || schema.anyOf || [];
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
    if (schema.allOf) {
      // Merge all schemas together
      const merged: SimpleSchema = { type: 'object', properties: {}, required: [] };
      for (const subSchema of schema.allOf) {
        if (subSchema.properties) {
          Object.assign(merged.properties, subSchema.properties);
        }
        if (subSchema.required) {
          merged.required.push(...subSchema.required);
        }
      }
      if (Object.keys(merged.properties).length > 0) {
        const props = Object.entries(merged.properties)
          .filter(([_, propSchema]) => isVisible(propSchema))
          .map(([name, propSchema]) => ({
            name,
            $type: processSchema(propSchema),
            required: merged.required.includes(name),
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
    if ((schema.type === 'object' || schema.properties) && (schema.properties || (schema.additionalProperties && typeof schema.additionalProperties === 'object'))) {
      const required = schema.required || [];
      const props: { name: string; $type: string; required: boolean }[] = [];

      if (schema.properties) {
        for (const [name, propSchema] of Object.entries(schema.properties)) {
          if (!isVisible(propSchema)) continue;
          props.push({
            name,
            $type: processSchema(propSchema as SimpleSchema),
            required: required.includes(name),
          });
        }
      }

      // Include additionalProperties as a synthetic [key: string] entry
      if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        props.push({
          name: '[key: string]',
          $type: processSchema(schema.additionalProperties),
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
    if (schema.type === 'array' && schema.items) {
      refs[id] = {
        ...base,
        type: 'array',
        item: { $type: processSchema(schema.items) },
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

  function generateInfoTags(schema: SimpleSchema): ReactNode[] {
    const tags: ReactNode[] = [];

    if (schema.default !== undefined) {
      const defaultStr = JSON.stringify(schema.default);
      // Skip empty objects/arrays as defaults - they're noise
      if (defaultStr !== '{}' && defaultStr !== '[]') {
        tags.push(
          <span key="default" className="text-xs text-fd-muted-foreground">
            Default: <code className="rounded border border-fd-border px-1 py-0.5 font-mono">{defaultStr}</code>
          </span>
        );
      }
    }

    if (schema.format) {
      tags.push(
        <span key="format" className="text-xs text-fd-muted-foreground">
          Format: <code className="rounded border border-fd-border px-1 py-0.5 font-mono">{schema.format}</code>
        </span>
      );
    }

    // Enum values are rendered separately in the UI, not as an info tag

    return tags;
  }

  const $root = processSchema(options.root);
  return { $root, refs };
}
