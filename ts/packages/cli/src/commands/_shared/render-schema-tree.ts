interface JsonSchemaLike {
  readonly type?: unknown;
  readonly description?: unknown;
  readonly default?: unknown;
  readonly required?: unknown;
  readonly properties?: unknown;
  readonly items?: unknown;
}

function asRecord(input: unknown): Record<string, unknown> | null {
  if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }

  return null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asArray(value: unknown): ReadonlyArray<unknown> {
  return Array.isArray(value) ? value : [];
}

function stringifyDefault(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function renderNode(
  name: string,
  schema: JsonSchemaLike,
  indent: number,
  requiredSet: ReadonlySet<string>,
  lines: Array<string>
) {
  const typeName = asString(schema.type) ?? 'unknown';
  const description = asString(schema.description);
  const isRequired = requiredSet.has(name);

  lines.push(`${' '.repeat(indent)}- ${name}${isRequired ? ' (required)' : ''}`);
  lines.push(`${' '.repeat(indent + 2)}type: ${typeName}`);

  if (description !== null && description.length > 0) {
    lines.push(`${' '.repeat(indent + 2)}description: ${description}`);
  }

  if (schema.default !== undefined) {
    lines.push(`${' '.repeat(indent + 2)}default: ${stringifyDefault(schema.default)}`);
  }

  const propertiesRecord = asRecord(schema.properties);
  if (propertiesRecord !== null) {
    const required = new Set(
      asArray(schema.required).filter(field => typeof field === 'string') as ReadonlyArray<string>
    );

    for (const [childName, childSchema] of Object.entries(propertiesRecord)) {
      const childRecord = asRecord(childSchema);
      if (childRecord !== null) {
        renderNode(childName, childRecord as JsonSchemaLike, indent + 2, required, lines);
      }
    }
  }

  const itemsRecord = asRecord(schema.items);
  if (itemsRecord !== null) {
    renderNode('[items]', itemsRecord as JsonSchemaLike, indent + 2, new Set(), lines);
  }
}

export function renderSchemaTree(schemaInput: unknown): string {
  const schema = asRecord(schemaInput);
  if (schema === null) {
    return '  <schema unavailable>';
  }

  const properties = asRecord(schema.properties);
  if (properties === null || Object.keys(properties).length === 0) {
    return '  <no properties>';
  }

  const required = new Set(
    asArray(schema.required).filter(field => typeof field === 'string') as ReadonlyArray<string>
  );
  const lines: Array<string> = [];

  for (const [name, childSchema] of Object.entries(properties)) {
    const childRecord = asRecord(childSchema);
    if (childRecord !== null) {
      renderNode(name, childRecord as JsonSchemaLike, 2, required, lines);
    }
  }

  return lines.join('\n');
}
