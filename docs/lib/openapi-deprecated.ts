import { z } from 'zod';

const ObjectSchema = z.record(z.string(), z.unknown());
const Schema = z
  .object({
    $ref: z.string().optional(),
    deprecated: z.boolean().optional(),
    properties: z.record(z.string(), z.unknown()).optional(),
    required: z.array(z.string()).optional(),
  })
  .loose();

// These are payloads, not schemas. In particular, a payload may legitimately
// contain properties named "deprecated" or "properties".
const PAYLOAD_KEYS = new Set(['default', 'example', 'examples', 'enum', 'const']);
const SCHEMA_MAPS = new Set([
  'properties',
  'patternProperties',
  '$defs',
  'definitions',
  'dependentSchemas',
]);
const SCHEMA_LISTS = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
const SCHEMA_CHILDREN = new Set([
  'items',
  'additionalProperties',
  'contains',
  'not',
  'if',
  'then',
  'else',
  'propertyNames',
  'unevaluatedProperties',
]);

/** Filter only the playground copy; keep the reference and published contract intact. */
export function hideDeprecatedFields<T extends object>(input: T): T {
  const document = structuredClone(input);
  function object(value: unknown) {
    const parsed = ObjectSchema.safeParse(value);
    if (!parsed.success) return undefined;
    return parsed.data;
  }

  function resolvePointer(ref: string): unknown {
    if (!ref.startsWith('#/')) return undefined;
    let value: unknown = input;
    for (const part of ref.slice(2).split('/')) {
      value = object(value)?.[decodeURIComponent(part).replace(/~1/g, '/').replace(/~0/g, '~')];
    }
    return value;
  }

  function resolve(value: unknown, seen = new Set<string>()): z.infer<typeof Schema> | undefined {
    const parsed = Schema.safeParse(value);
    if (!parsed.success) return undefined;
    const schema = parsed.data;
    if (!schema.$ref || seen.has(schema.$ref)) return schema;
    seen.add(schema.$ref);
    return { ...resolve(resolvePointer(schema.$ref), seen), ...schema };
  }

  function schemaVariants(value: unknown, seen = new Set<unknown>()): z.infer<typeof Schema>[] {
    if (seen.has(value)) return [];
    seen.add(value);
    const schema = resolve(value);
    if (!schema) return [];
    return [
      schema,
      ...['allOf', 'anyOf', 'oneOf'].flatMap(key => {
        const variants = schema[key];
        return Array.isArray(variants) ? variants.flatMap(item => schemaVariants(item, seen)) : [];
      }),
    ];
  }

  function properties(value: unknown) {
    const result = new Map<string, unknown[]>();
    for (const schema of schemaVariants(value)) {
      for (const [name, child] of Object.entries(schema.properties ?? {})) {
        result.set(name, [...(result.get(name) ?? []), child]);
      }
    }
    return result;
  }

  const allDeprecated = (schemas: unknown[]) =>
    schemas.every(schema => resolve(schema)?.deprecated === true);

  // Inspect the original schemas, which still contain the deprecation flags.
  // If a union also defines a current field with this name, preserve its value.
  function cleanValue(value: unknown, rawSchema: unknown): unknown {
    if (Array.isArray(value)) {
      const items = schemaVariants(rawSchema)
        .map(schema => schema.items)
        .filter(item => item !== undefined);
      return value.map(item => cleanValue(item, { allOf: items }));
    }
    const record = object(value);
    if (!record) return value;
    for (const [name, children] of properties(rawSchema)) {
      if (allDeprecated(children)) delete record[name];
      else if (Object.hasOwn(record, name))
        record[name] = cleanValue(record[name], { allOf: children });
    }
    return record;
  }

  function filterSchema(value: unknown): unknown {
    const parsed = Schema.safeParse(value);
    if (!parsed.success) return value; // Boolean schemas are valid in OpenAPI 3.1.
    const schema = parsed.data;
    if (schema.properties) {
      const hidden = new Set(
        Object.entries(schema.properties)
          .filter(([, child]) => resolve(child)?.deprecated === true)
          .map(([name]) => name)
      );
      schema.properties = Object.fromEntries(
        Object.entries(schema.properties)
          .filter(([name]) => !hidden.has(name))
          .map(([name, child]) => [name, filterSchema(child)])
      );
    }
    if (schema.required) {
      const fields = properties(value);
      schema.required = schema.required.filter(name => {
        const definitions = fields.get(name);
        return !definitions || !allDeprecated(definitions);
      });
    }
    for (const [key, child] of Object.entries(schema)) {
      if (key === 'default' || key === 'example') schema[key] = cleanValue(child, value);
      else if (key === 'examples' && Array.isArray(child))
        schema[key] = child.map(item => cleanValue(item, value));
      else if (key !== 'properties' && SCHEMA_MAPS.has(key)) {
        const map = object(child);
        if (map)
          schema[key] = Object.fromEntries(
            Object.entries(map).map(([name, item]) => [name, filterSchema(item)])
          );
      } else if (SCHEMA_LISTS.has(key) && Array.isArray(child))
        schema[key] = child.map(filterSchema);
      else if (SCHEMA_CHILDREN.has(key)) schema[key] = filterSchema(child);
    }
    return schema;
  }

  function walk(value: unknown, key = ''): unknown {
    if (Array.isArray(value)) return value.map(item => walk(item));
    const record = object(value);
    if (!record) return value;
    for (const [name, child] of Object.entries(record)) {
      if (name === 'schema') record[name] = filterSchema(child);
      else if (key === 'components' && name === 'schemas') {
        const schemas = object(child);
        if (schemas)
          record[name] = Object.fromEntries(
            Object.entries(schemas).map(([id, schema]) => [id, filterSchema(schema)])
          );
      } else if (!PAYLOAD_KEYS.has(name) && !name.startsWith('x-'))
        record[name] = walk(child, name);
    }
    if (record.schema) {
      if (Object.hasOwn(record, 'example'))
        record.example = cleanValue(record.example, object(value)?.schema);
      const examples = object(record.examples);
      if (examples) {
        record.examples = Object.fromEntries(
          Object.entries(examples).map(([name, entry]) => {
            const example = resolve(entry);
            if (example && Object.hasOwn(example, 'value')) {
              example.value = cleanValue(example.value, object(value)?.schema);
              delete example.$ref; // Inline this usage so shared examples remain unchanged.
            }
            return [name, example ?? entry];
          })
        );
      }
    }
    return record;
  }

  Object.assign(document, walk(document));
  return document;
}
