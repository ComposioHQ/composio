type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function normalizeJson(value: unknown, path: string): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Non-finite number at ${path}`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeJson(item, `${path}[${index}]`));
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map(key => {
          if (record[key] === undefined) {
            throw new TypeError(`Undefined value at ${path}.${key}`);
          }
          return [key, normalizeJson(record[key], `${path}.${key}`)];
        })
    );
  }
  throw new TypeError(`Unsupported JSON value at ${path}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeJson(value, '$'));
}
