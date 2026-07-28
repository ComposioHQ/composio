import type { ParameterSchema, Tool } from '@/types/toolkit';
import {
  isUnknownRecord,
  toBoolean,
  toOptionalString,
  toString,
  toStringArray,
  toUnknownRecord,
} from '@/lib/unknown-value';

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
      const param = toUnknownRecord(value);
      const items = isUnknownRecord(param.items) ? param.items : undefined;
      result[key] = {
        type: toString(param.type),
        description: toOptionalString(param.description),
        default: param.default,
        example: param.example,
        enum: toStringArray(param.enum),
        required: requiredList.includes(key),
        ...(isUnknownRecord(param.properties)
          ? { properties: processParams(param.properties, toStringArray(param.required)) }
          : {}),
        ...(Array.isArray(param.required) ? { requiredFields: toStringArray(param.required) } : {}),
        ...(items
          ? {
              items: {
                type: toString(items.type),
                description: toOptionalString(items.description),
                default: items.default,
                example: items.example,
                enum: toStringArray(items.enum),
                ...(isUnknownRecord(items.properties)
                  ? { properties: processParams(items.properties, toStringArray(items.required)) }
                  : {}),
                ...(Array.isArray(items.required)
                  ? { requiredFields: toStringArray(items.required) }
                  : {}),
              },
            }
          : {}),
        ...(typeof param.additionalProperties === 'boolean'
          ? { additionalProperties: param.additionalProperties }
          : isUnknownRecord(param.additionalProperties)
            ? {
                additionalProperties: {
                  type: toString(param.additionalProperties.type),
                  description: toOptionalString(param.additionalProperties.description),
                },
              }
            : {}),
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
