import type { ParameterSchema, Tool } from '@/types/toolkit';

// Add required flag to each property based on the required array
// Preserves nested properties/items for object and array types
function processParams(props: any, requiredList: string[]): Record<string, ParameterSchema> | undefined {
  if (!props || typeof props !== 'object') return undefined;
  const result: Record<string, ParameterSchema> = {};
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'object' && value !== null) {
      const param = value as any;
      result[key] = {
        type: param.type,
        description: param.description,
        default: param.default,
        example: param.example,
        enum: param.enum,
        required: requiredList.includes(key),
        ...(param.properties ? { properties: param.properties } : {}),
        ...(Array.isArray(param.required) ? { requiredFields: param.required } : {}),
        ...(param.items ? { items: {
          ...param.items,
          ...(Array.isArray(param.items.required) ? { requiredFields: param.items.required } : {}),
        } } : {}),
        ...(param.additionalProperties && typeof param.additionalProperties === 'object'
          ? { additionalProperties: param.additionalProperties }
          : {}),
      };
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

// Process a raw JSON Schema (with top-level properties + required) into ParameterSchema records
export function processSchema(schema: any): Record<string, ParameterSchema> | undefined {
  if (!schema) return undefined;
  const props = schema.properties || schema;
  const required = schema.required || [];
  if (!props || typeof props !== 'object') return undefined;
  return processParams(props, required);
}

// Convert a raw API tool object into our Tool type
export function toolFromApi(tool: any): Tool {
  const inputSchema = tool.input_parameters || tool.parameters;
  const outputSchema = tool.output_parameters || tool.response;

  return {
    slug: tool.slug || '',
    name: tool.name || tool.display_name || tool.slug || '',
    description: tool.description || '',
    input_parameters: processSchema(inputSchema),
    output_parameters: processSchema(outputSchema),
    scopes: tool.scopes || undefined,
    tags: tool.tags || undefined,
    is_deprecated: tool.is_deprecated || false,
  };
}
