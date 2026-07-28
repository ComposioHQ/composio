import type { ParameterSchema, Tool } from '@/types/toolkit';
import {
  isUnknownRecord,
  toBoolean,
  toOptionalString,
  toString,
  toStringArray,
  toUnknownRecord,
  type UnknownRecord,
} from '@/lib/unknown-value';

// Build one ParameterSchema node from a raw JSON-Schema property value,
// recursing into properties, items, and object-valued additionalProperties
// so nested subschemas survive whole (the toolkit detail UI reads
// items.additionalProperties and additionalProperties.properties).
function processOne(param: UnknownRecord): ParameterSchema {
  const node: ParameterSchema = {
    type: toString(param.type),
    description: toOptionalString(param.description),
    default: param.default,
    example: param.example,
    enum: toStringArray(param.enum),
  };

  if (isUnknownRecord(param.properties)) {
    node.properties = processParams(param.properties, toStringArray(param.required));
  }
  if (Array.isArray(param.required)) {
    node.requiredFields = toStringArray(param.required);
  }
  if (isUnknownRecord(param.items)) {
    node.items = processOne(param.items);
  }
  if (typeof param.additionalProperties === 'boolean') {
    node.additionalProperties = param.additionalProperties;
  } else if (isUnknownRecord(param.additionalProperties)) {
    node.additionalProperties = processOne(param.additionalProperties);
  }

  return node;
}

// Add required flag to each property based on the required array
// Preserves nested properties/items for object and array types
function processParams(
  props: unknown,
  requiredList: string[]
): Record<string, ParameterSchema> | undefined {
  if (!props || typeof props !== 'object') return undefined;
  const result: Record<string, ParameterSchema> = {};
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'object' && value !== null) {
      result[key] = {
        ...processOne(toUnknownRecord(value)),
        required: requiredList.includes(key),
      };
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

// Process a raw JSON Schema (with top-level properties + required) into ParameterSchema records
export function processSchema(schema: unknown): Record<string, ParameterSchema> | undefined {
  if (!isUnknownRecord(schema)) return undefined;
  const props = isUnknownRecord(schema.properties) ? schema.properties : schema;
  const required = toStringArray(schema.required);
  if (!props || typeof props !== 'object') return undefined;
  return processParams(props, required);
}

// Convert a raw API tool object into our Tool type
export function toolFromApi(tool: unknown): Tool {
  const rawTool = toUnknownRecord(tool);
  const inputSchema = rawTool.input_parameters || rawTool.parameters;
  const outputSchema = rawTool.output_parameters || rawTool.response;
  const slug = toString(rawTool.slug);

  return {
    slug,
    name: toOptionalString(rawTool.name) ?? toOptionalString(rawTool.display_name) ?? slug,
    description: toString(rawTool.description),
    input_parameters: processSchema(inputSchema),
    output_parameters: processSchema(outputSchema),
    scopes: toStringArray(rawTool.scopes),
    tags: toStringArray(rawTool.tags),
    is_deprecated: toBoolean(rawTool.is_deprecated),
  };
}
