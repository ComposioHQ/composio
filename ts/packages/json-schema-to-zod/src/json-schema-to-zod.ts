import { $ZodType } from 'zod/v4/core';

import { parseSchema } from './parsers/parse-schema';
import type { JsonSchemaToZodOptions, JsonSchema } from './types';

export const jsonSchemaToZod = (
  schema: JsonSchema,
  options: JsonSchemaToZodOptions = {}
): $ZodType => {
  return parseSchema(schema, {
    path: [],
    seen: new Map(),
    ...options,
  });
};
