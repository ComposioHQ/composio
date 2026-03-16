export interface SchemaPropertyEntry {
  readonly name: string;
  readonly type: string;
  readonly label: 'required' | 'optional';
  readonly description?: string;
  readonly hasDefault: boolean;
  readonly defaultValue: unknown;
}

export function extractSchemaProperties(
  schema: Record<string, unknown>
): ReadonlyArray<SchemaPropertyEntry> {
  const properties = schema['properties'] as Record<string, Record<string, unknown>> | undefined;
  if (!properties || Object.keys(properties).length === 0) {
    return [];
  }

  const requiredArr = (schema['required'] as string[] | undefined) ?? [];
  const requiredSet = new Set(requiredArr);

  return Object.entries(properties).map(([name, prop]) => {
    const type = (prop['type'] as string) ?? 'unknown';
    const label = requiredSet.has(name) ? 'required' : 'optional';
    const description = prop['description'] as string | undefined;
    const hasDefault = Object.prototype.hasOwnProperty.call(prop, 'default');
    const defaultValue = hasDefault ? prop['default'] : undefined;
    return {
      name,
      type,
      label,
      description,
      hasDefault,
      defaultValue,
    };
  });
}
