import { z } from 'zod';
import type { ParameterSchema, Tool, Trigger } from '@/types/toolkit';

// Zod schemas for the untyped tool/trigger payloads the Composio API returns.
// Each boundary parses once (leniently — malformed fields degrade to the same
// fallbacks the UI applied by hand before) and lets the inferred types flow.

/** Keep only the array members that satisfy `schema`; junk entries are dropped. */
function filteredArray<T>(schema: z.ZodType<T>) {
  return z
    .array(z.unknown())
    .catch([])
    .transform(items =>
      items.flatMap(item => {
        const parsed = schema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      })
    );
}

const lenientString = z.string().catch('');
const optionalString = z.string().optional().catch(undefined);
const stringArray = filteredArray(z.string());
const scalarStringArray = filteredArray(
  z.union([z.string(), z.number(), z.boolean()]).transform(value => String(value))
);

// --- JSON-Schema parameter nodes -------------------------------------------

// Recursive JSON-Schema property node. Nested properties, items, and
// object-valued additionalProperties survive whole (the toolkit detail UI
// reads items.additionalProperties and additionalProperties.properties to
// synthesize the "[key: string]" row). Tuple-form `items` arrays are not
// object nodes and parse to undefined instead of spreading into numeric keys.
interface RawSchemaNode {
  type: string;
  description?: string;
  default?: unknown;
  example?: unknown;
  enum: string[];
  properties?: Record<string, unknown>;
  required?: string[];
  items?: RawSchemaNode;
  additionalProperties?: boolean | RawSchemaNode;
}

const rawSchemaNodeSchema: z.ZodType<RawSchemaNode> = z.object({
  type: lenientString,
  description: optionalString,
  default: z.unknown().optional(),
  example: z.unknown().optional(),
  enum: scalarStringArray,
  properties: z.record(z.string(), z.unknown()).optional().catch(undefined),
  required: filteredArray(z.string()).optional().catch(undefined),
  get items(): z.ZodType<RawSchemaNode | undefined> {
    return rawSchemaNodeSchema.optional().catch(undefined);
  },
  get additionalProperties(): z.ZodType<boolean | RawSchemaNode | undefined> {
    return z.union([z.boolean(), rawSchemaNodeSchema]).optional().catch(undefined);
  },
});

function toParameterSchema(node: RawSchemaNode): ParameterSchema {
  const param: ParameterSchema = {
    type: node.type,
    description: node.description,
    default: node.default,
    example: node.example,
    enum: node.enum.length > 0 ? node.enum : undefined,
  };

  if (node.properties) {
    param.properties = processParams(node.properties, node.required ?? []);
  }
  if (node.required) {
    param.requiredFields = node.required;
  }
  if (node.items) {
    param.items = toParameterSchema(node.items);
  }
  if (typeof node.additionalProperties === 'boolean') {
    param.additionalProperties = node.additionalProperties;
  } else if (node.additionalProperties) {
    param.additionalProperties = toParameterSchema(node.additionalProperties);
  }

  return param;
}

// Add required flag to each property based on the required array
// Preserves nested properties/items for object and array types
function processParams(
  props: Record<string, unknown>,
  requiredList: string[]
): Record<string, ParameterSchema> | undefined {
  const result: Record<string, ParameterSchema> = {};
  for (const [key, value] of Object.entries(props)) {
    const parsed = rawSchemaNodeSchema.safeParse(value);
    if (parsed.success) {
      result[key] = {
        ...toParameterSchema(parsed.data),
        required: requiredList.includes(key),
      };
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

const rawSchemaRootSchema = z.object({
  properties: z.record(z.string(), z.unknown()).optional().catch(undefined),
  required: stringArray,
});

// Process a raw JSON Schema (with top-level properties + required) into ParameterSchema records
export function processSchema(schema: unknown): Record<string, ParameterSchema> | undefined {
  const record = z.record(z.string(), z.unknown()).safeParse(schema);
  if (!record.success) return undefined;
  const root = rawSchemaRootSchema.parse(record.data);
  return processParams(root.properties ?? record.data, root.required);
}

// --- Tools ------------------------------------------------------------------

const rawApiToolSchema = z.object({
  slug: lenientString,
  name: optionalString,
  display_name: optionalString,
  description: lenientString,
  input_parameters: z.unknown().optional(),
  parameters: z.unknown().optional(),
  output_parameters: z.unknown().optional(),
  response: z.unknown().optional(),
  scopes: stringArray,
  tags: stringArray,
  is_deprecated: z.boolean().catch(false),
});

type RawApiTool = z.infer<typeof rawApiToolSchema>;

function toolFromRaw(raw: RawApiTool): Tool {
  return {
    slug: raw.slug,
    name: raw.name || raw.display_name || raw.slug,
    description: raw.description,
    input_parameters: processSchema(raw.input_parameters || raw.parameters),
    output_parameters: processSchema(raw.output_parameters || raw.response),
    scopes: raw.scopes.length > 0 ? raw.scopes : undefined,
    tags: raw.tags.length > 0 ? raw.tags : undefined,
    is_deprecated: raw.is_deprecated,
  };
}

// Convert a raw API tool object into our Tool type
export function toolFromApi(tool: unknown): Tool {
  const parsed = rawApiToolSchema.safeParse(tool);
  return toolFromRaw(parsed.success ? parsed.data : rawApiToolSchema.parse({}));
}

// --- Triggers ---------------------------------------------------------------

const rawApiTriggerSchema = z.object({
  slug: lenientString,
  name: optionalString,
  display_name: optionalString,
  description: lenientString,
  type: z.enum(['webhook', 'poll']).optional().catch(undefined),
  config: z.unknown().optional(),
  payload: z.unknown().optional(),
  instructions: optionalString,
});

type RawApiTrigger = z.infer<typeof rawApiTriggerSchema>;

function triggerFromRaw(raw: RawApiTrigger): Trigger {
  return {
    slug: raw.slug,
    name: raw.name || raw.display_name || raw.slug,
    description: raw.description,
    type: raw.type,
    config: processSchema(raw.config),
    payload: processSchema(raw.payload),
    instructions: raw.instructions,
  };
}

// Convert a raw API trigger object into our Trigger type
export function triggerFromApi(trigger: unknown): Trigger {
  const parsed = rawApiTriggerSchema.safeParse(trigger);
  return triggerFromRaw(parsed.success ? parsed.data : rawApiTriggerSchema.parse({}));
}

// --- List responses ---------------------------------------------------------

// Paged API responses arrive either as a bare array or as an { items } envelope.
const listEnvelopeSchema = z.union([
  z.object({ items: z.array(z.unknown()) }).transform(data => data.items),
  z.array(z.unknown()),
]);

/** Parses a /tools list response into Tool records, dropping non-object entries. */
export const apiToolListSchema = listEnvelopeSchema.transform(items =>
  items.flatMap(item => {
    const parsed = rawApiToolSchema.safeParse(item);
    return parsed.success ? [toolFromRaw(parsed.data)] : [];
  })
);

/** Parses a /triggers_types list response into Trigger records, dropping non-object entries. */
export const apiTriggerListSchema = listEnvelopeSchema.transform(items =>
  items.flatMap(item => {
    const parsed = rawApiTriggerSchema.safeParse(item);
    return parsed.success ? [triggerFromRaw(parsed.data)] : [];
  })
);
