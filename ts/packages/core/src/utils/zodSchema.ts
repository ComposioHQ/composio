import * as z4 from 'zod/v4';
import * as zodToJsonSchema from 'zod-to-json-schema';
import type { AnyZodSchema } from '../types/customTool.types';

type JsonSchemaObject = Record<string, unknown>;
type ObjectJsonSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
};
type ZodDef = {
  // Zod v4 stores a string literal ('object', 'array', ...) here. Zod v3 leaves it unset for
  // most types, but for `z.array()` / `z.promise()` it holds the element/inner ZodType (an object),
  // never a string — which is exactly what lets `isZodV4Schema` tell the two runtimes apart.
  type?: unknown;
  typeName?: string;
};
type ZodJsonSchemaMode = 'input' | 'output';

const getZodDef = (value: unknown): ZodDef | undefined =>
  typeof value === 'object' && value !== null ? (value as { _def?: ZodDef })._def : undefined;

// Discriminate Zod v4 from the bundled v3 compat layer. v4-native exposes `_def.type` as a string
// literal; v3 exposes `_def.typeName` and, when `_def.type` is present (arrays/promises), it is a
// ZodType object, not a string. Re-verify this invariant on a Zod major bump.
const isZodV4Schema = (schema: AnyZodSchema): schema is z4.ZodType =>
  typeof getZodDef(schema)?.type === 'string';

const stripSchemaKeyword = (schema: JsonSchemaObject): JsonSchemaObject => {
  const { $schema: _schema, ...rest } = schema;
  return rest;
};

const getNamedDefinition = (schema: JsonSchemaObject, name: string): JsonSchemaObject => {
  const definitions = schema.definitions as Record<string, JsonSchemaObject> | undefined;
  const definition = definitions?.[name];
  // zod-to-json-schema with `{ name }` always nests the schema under `definitions[name]`. If it's
  // missing, the conversion didn't match the expected contract — fail loudly rather than returning
  // the wrapper document, which downstream would silently degrade to an empty object schema.
  if (typeof definition !== 'object' || definition === null) {
    throw new Error(`Expected definition "${name}" in the converted JSON schema.`);
  }

  return definition;
};

export const isZodObjectSchema = (value: unknown): value is AnyZodSchema => {
  const def = getZodDef(value);
  return def?.typeName === 'ZodObject' || def?.type === 'object';
};

export const zodSchemaToJsonSchema = (
  schema: AnyZodSchema,
  name: string = 'schema',
  mode: ZodJsonSchemaMode = 'output'
): JsonSchemaObject => {
  if (isZodV4Schema(schema)) {
    return stripSchemaKeyword(z4.toJSONSchema(schema, { io: mode }));
  }

  // Mirror the v4 `io` mode on the v3 converter so the two runtimes serialize `.default()`,
  // `.transform()` and `.pipe()` schemas consistently at this boundary.
  const converted = zodToJsonSchema.default(schema, {
    name,
    pipeStrategy: mode,
    effectStrategy: mode === 'input' ? 'input' : 'any',
  });

  return stripSchemaKeyword(getNamedDefinition(converted, name));
};

export const zodObjectSchemaToJsonSchema = (
  schema: AnyZodSchema,
  name: string = 'schema',
  mode: ZodJsonSchemaMode = 'input'
): ObjectJsonSchema => {
  if (!isZodObjectSchema(schema)) {
    throw new Error('Expected a z.object() schema.');
  }

  // The schema is a confirmed object and getNamedDefinition guarantees a well-formed conversion,
  // so the result always carries `properties` (and `required` only when there are required keys).
  const jsonSchema = zodSchemaToJsonSchema(schema, name, mode);

  return {
    type: 'object',
    properties: (jsonSchema.properties as Record<string, unknown>) ?? {},
    ...(jsonSchema.required ? { required: jsonSchema.required as string[] } : {}),
  };
};
