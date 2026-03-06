import { extractSchemaProperties } from './extract-schema-properties';

/**
 * Builds a minimal valid JSON payload from a JSON Schema input_schema.
 * Used for CTA examples (e.g. composio execute "TOOL" -d '...').
 */
export function buildMinimalPayloadFromSchema(
  schema: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') {
    return {};
  }

  const entries = extractSchemaProperties(schema);
  if (entries.length === 0) {
    return {};
  }

  const result: Record<string, unknown> = {};
  for (const entry of entries) {
    result[entry.name] = defaultForType(entry.type, entry.defaultValue);
  }
  return result;
}

function defaultForType(type: string, schemaDefault: unknown): unknown {
  if (schemaDefault !== undefined) {
    return schemaDefault;
  }
  switch (type) {
    case 'string':
      return '';
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object':
      return {};
    default:
      return '';
  }
}
