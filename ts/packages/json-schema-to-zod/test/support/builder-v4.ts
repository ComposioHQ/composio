import * as z4 from 'zod/v4';

import { jsonSchemaToZod as v4Convert, jsonSchemaToZodShape as v4ConvertShape } from '../../src/v4';
import type { Builder, RuntimeSchema, SchemaKind } from './builders';

const V4_KINDS: Record<string, SchemaKind> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  null: 'null',
  object: 'object',
  array: 'array',
};

const asV4 = (schema: RuntimeSchema): z4.ZodType => schema as unknown as z4.ZodType;

export const v4: Builder = {
  name: 'zod-v4',
  convert: (schema, options) => v4Convert(schema, options) as unknown as RuntimeSchema,
  convertShape: (schema, options) =>
    v4ConvertShape(schema, options) as unknown as Record<string, RuntimeSchema>,
  objectFromShape: shape =>
    z4.object(shape as unknown as Record<string, z4.ZodType>) as unknown as RuntimeSchema,
  kind: schema => V4_KINDS[asV4(schema).def.type] ?? 'other',
  shape: schema => (asV4(schema) as z4.ZodObject).shape as unknown as Record<string, RuntimeSchema>,
  description: schema => asV4(schema).description,
  toJsonSchema: schema => z4.toJSONSchema(asV4(schema), { io: 'input' }) as Record<string, unknown>,
};
